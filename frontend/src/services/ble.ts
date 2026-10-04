/**
 * BLE Service — Communication layer for the T.E.R.E.S.A. ESP32-C3 Mini.
 *
 * The ESP32-C3 firmware is finalized and MUST NOT change. This module adapts
 * the app to the firmware's exact protocol:
 *
 *   Device name  : TERESA01
 *   Service UUID : 7b4c0001-7f9d-4a2e-9d7c-6f3e2a1b0001
 *   Telemetry    : 7b4c0002-7f9d-4a2e-9d7c-6f3e2a1b0001  (NOTIFY + READ)
 *   Command      : 7b4c0003-7f9d-4a2e-9d7c-6f3e2a1b0001  (WRITE, no commands sent yet)
 *
 *   Telemetry payload (sent every ~1 s while a client is connected):
 *       TEMP=36.8;HUM=52.4;STATE=EM_TRATAMENTO
 *
 *   STATE is one of:
 *       AGUARDANDO_BRACELETE | AGUARDANDO_INICIO | AQUECENDO |
 *       EM_TRATAMENTO | TRATAMENTO_INTERROMPIDO | TRATAMENTO_FINALIZADO
 *
 * The connection is only considered "ativa" after the first valid telemetry
 * frame is received. BLE link alone does NOT count as connected.
 *
 * `react-native-ble-plx` is loaded lazily; the module is a safe no-op on
 * Expo Go / web (where native BLE is unavailable).
 */

import { PermissionsAndroid, Platform } from 'react-native';
import { Buffer } from 'buffer';

// ============================================================================
// Firmware constants — MATCH THE ARDUINO SKETCH. Do NOT change.
// ============================================================================
export const TARGET_DEVICE_NAME = 'TERESA01';
export const TERESA_SERVICE_UUID = '7b4c0001-7f9d-4a2e-9d7c-6f3e2a1b0001';
export const TERESA_TELEMETRY_CHAR = '7b4c0002-7f9d-4a2e-9d7c-6f3e2a1b0001';
export const TERESA_COMMAND_CHAR = '7b4c0003-7f9d-4a2e-9d7c-6f3e2a1b0001';

// ============================================================================
// Treatment state (mirrors the ESP32 state machine 1:1)
// ============================================================================
export type TreatmentState =
  | 'AGUARDANDO_BRACELETE'
  | 'AGUARDANDO_INICIO'
  | 'AQUECENDO'
  | 'EM_TRATAMENTO'
  | 'TRATAMENTO_INTERROMPIDO'
  | 'TRATAMENTO_FINALIZADO'
  | 'DESCONHECIDO';

export const KNOWN_STATES: readonly TreatmentState[] = [
  'AGUARDANDO_BRACELETE',
  'AGUARDANDO_INICIO',
  'AQUECENDO',
  'EM_TRATAMENTO',
  'TRATAMENTO_INTERROMPIDO',
  'TRATAMENTO_FINALIZADO',
] as const;

export function labelForState(s: TreatmentState): string {
  switch (s) {
    case 'AGUARDANDO_BRACELETE':
      return 'Aguardando bracelete';
    case 'AGUARDANDO_INICIO':
      return 'Aguardando início';
    case 'AQUECENDO':
      return 'Aquecendo';
    case 'EM_TRATAMENTO':
      return 'Em tratamento';
    case 'TRATAMENTO_INTERROMPIDO':
      return 'Tratamento interrompido';
    case 'TRATAMENTO_FINALIZADO':
      return 'Tratamento finalizado';
    default:
      return 'Estado desconhecido';
  }
}

// ============================================================================
// Public types
// ============================================================================

/**
 * `connected` means BLE is linked AND we're actually receiving valid
 * telemetry. `connecting` covers the initial handshake and the window
 * between a successful BLE link and the first telemetry frame.
 * `reconnecting` is set while the auto-reconnect scheduler is retrying.
 * `bt_off` / `unauthorized` surface precise error reasons.
 */
export type ConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'bt_off'
  | 'unauthorized'
  | 'error';

export interface BleDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

export interface TeresaTelemetry {
  temperature_c: number;
  humidity_pct: number;
  state: TreatmentState;
  /** ISO timestamp when the app received the frame. */
  received_at: string;
}

/** Raw diagnostic entry — useful during physical bench tests. */
export interface DiagnosticEntry {
  at: string;         // ISO timestamp
  level: 'info' | 'warn' | 'error' | 'rx';
  text: string;       // human readable
}

/** Command payloads (not sent in this phase — reserved for future). */
export type Command =
  | { type: 'start_session' }
  | { type: 'pause_session' }
  | { type: 'stop_session' };

export interface ConnectionMeta {
  state: ConnectionState;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  framesReceived: number;
  lastFrameAt: string | null;      // ISO timestamp
  lastRawFrame: string | null;     // raw payload of the latest frame
}

type Listener<T> = (v: T) => void;

// ============================================================================
// Tunables
// ============================================================================
const TELEMETRY_TIMEOUT_MS = 10_000; // ESP32 sends every ~1s; 10s silence ⇒ dead
const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_ATTEMPTS = 10;
const SCAN_TIMEOUT_MS = 12_000;
const DIAGNOSTIC_BUFFER = 40;

// ============================================================================
// Service implementation
// ============================================================================
class BleService {
  private manager: any | null = null;
  private connectedDevice: any | null = null;
  private lastConnectedDeviceId: string | null = null;

  private state: ConnectionState = 'disconnected';
  private lastTelemetry: TeresaTelemetry | null = null;
  private framesReceived = 0;
  private lastFrameAt: string | null = null;
  private lastRawFrame: string | null = null;

  private stateListeners = new Set<Listener<ConnectionState>>();
  private deviceListeners = new Set<Listener<BleDevice[]>>();
  private telemetryListeners = new Set<Listener<TeresaTelemetry>>();
  private metaListeners = new Set<Listener<ConnectionMeta>>();
  private diagnosticListeners = new Set<Listener<DiagnosticEntry[]>>();
  private discoveredDevices = new Map<string, BleDevice>();
  private diagnostics: DiagnosticEntry[] = [];

  private telemetryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private scanTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  private telemetrySubscription: any | null = null;
  private disconnectSubscription: any | null = null;
  private btStateSubscription: any | null = null;

  // --------------------------------------------------------------------------
  private tryLoadManager(): boolean {
    if (this.manager) return true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BleManager } = require('react-native-ble-plx');
      this.manager = new BleManager();
      // Subscribe to BT state changes so UI can react to the radio turning off.
      try {
        this.btStateSubscription = this.manager.onStateChange((btState: string) => {
          this.diag('info', `BT radio: ${btState}`);
          if (btState === 'PoweredOff') {
            this.setState('bt_off');
            this.cleanupConnection();
          } else if (btState === 'Unauthorized') {
            this.setState('unauthorized');
          }
        }, true);
      } catch (e) {
        console.warn('BT state subscribe failed', (e as Error).message);
      }
      return true;
    } catch (e) {
      console.warn('BLE unavailable (Expo Go / web):', (e as Error).message);
      return false;
    }
  }

  isAvailable(): boolean {
    if (Platform.OS === 'web') return false;
    return this.tryLoadManager();
  }

  // --------------------------------------------------------------------------
  getState(): ConnectionState {
    return this.state;
  }

  getLastTelemetry(): TeresaTelemetry | null {
    return this.lastTelemetry;
  }

  getMeta(): ConnectionMeta {
    return {
      state: this.state,
      reconnectAttempt: this.reconnectAttempts,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      framesReceived: this.framesReceived,
      lastFrameAt: this.lastFrameAt,
      lastRawFrame: this.lastRawFrame,
    };
  }

  getDiagnostics(): DiagnosticEntry[] {
    return [...this.diagnostics];
  }

  onStateChange(fn: Listener<ConnectionState>): () => void {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => {
      this.stateListeners.delete(fn);
    };
  }

  onDevicesChange(fn: Listener<BleDevice[]>): () => void {
    this.deviceListeners.add(fn);
    fn(Array.from(this.discoveredDevices.values()));
    return () => {
      this.deviceListeners.delete(fn);
    };
  }

  onTelemetry(fn: Listener<TeresaTelemetry>): () => void {
    this.telemetryListeners.add(fn);
    if (this.lastTelemetry) fn(this.lastTelemetry);
    return () => {
      this.telemetryListeners.delete(fn);
    };
  }

  onMeta(fn: Listener<ConnectionMeta>): () => void {
    this.metaListeners.add(fn);
    fn(this.getMeta());
    return () => {
      this.metaListeners.delete(fn);
    };
  }

  onDiagnostics(fn: Listener<DiagnosticEntry[]>): () => void {
    this.diagnosticListeners.add(fn);
    fn([...this.diagnostics]);
    return () => {
      this.diagnosticListeners.delete(fn);
    };
  }

  private setState(s: ConnectionState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateListeners.forEach((fn) => fn(s));
    this.emitMeta();
  }

  private emitDevices(): void {
    const list = Array.from(this.discoveredDevices.values());
    this.deviceListeners.forEach((fn) => fn(list));
  }

  private emitMeta(): void {
    const m = this.getMeta();
    this.metaListeners.forEach((fn) => fn(m));
  }

  private diag(level: DiagnosticEntry['level'], text: string): void {
    const entry: DiagnosticEntry = {
      at: new Date().toISOString(),
      level,
      text,
    };
    this.diagnostics.push(entry);
    if (this.diagnostics.length > DIAGNOSTIC_BUFFER) {
      this.diagnostics = this.diagnostics.slice(-DIAGNOSTIC_BUFFER);
    }
    const copy = [...this.diagnostics];
    this.diagnosticListeners.forEach((fn) => fn(copy));
  }

  clearDiagnostics(): void {
    this.diagnostics = [];
    this.diagnosticListeners.forEach((fn) => fn([]));
  }

  // --------------------------------------------------------------------------
  // Permissions (Android 12+ requires BLUETOOTH_SCAN/CONNECT at runtime; <12
  // needs ACCESS_FINE_LOCATION). iOS requests the Bluetooth prompt on first
  // scan automatically via Info.plist.
  // --------------------------------------------------------------------------
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    const apiLevel = Number(Platform.Version);
    const required: string[] =
      apiLevel >= 31
        ? [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

    try {
      const granted = await PermissionsAndroid.requestMultiple(required as any);
      const allOk = Object.values(granted).every(
        (v) => v === PermissionsAndroid.RESULTS.GRANTED,
      );
      if (!allOk) {
        const denied = Object.entries(granted)
          .filter(([, v]) => v !== PermissionsAndroid.RESULTS.GRANTED)
          .map(([k]) => k.replace('android.permission.', ''));
        this.diag('warn', `Permissões negadas: ${denied.join(', ')}`);
        this.setState('unauthorized');
      }
      return allOk;
    } catch (e) {
      this.diag('error', `Erro em permissões: ${(e as Error).message}`);
      return false;
    }
  }

  async getBluetoothState(): Promise<string> {
    if (!this.isAvailable()) return 'Unknown';
    try {
      return await this.manager.state();
    } catch {
      return 'Unknown';
    }
  }

  // --------------------------------------------------------------------------
  // Scan — only surface devices whose advertised name is TERESA01
  // --------------------------------------------------------------------------
  async startScan(): Promise<void> {
    if (!this.isAvailable()) {
      this.diag('error', 'BLE indisponível (Expo Go / web).');
      this.setState('error');
      return;
    }

    const permitted = await this.requestPermissions();
    if (!permitted) {
      this.diag('error', 'Permissões Bluetooth não concedidas.');
      this.setState('unauthorized');
      return;
    }

    const btState = await this.getBluetoothState();
    this.diag('info', `BT state antes do scan: ${btState}`);
    if (btState === 'PoweredOff') {
      this.setState('bt_off');
      return;
    }
    if (btState === 'Unauthorized') {
      this.setState('unauthorized');
      return;
    }

    this.discoveredDevices.clear();
    this.emitDevices();
    this.setState('scanning');
    this.diag('info', `Procurando por "${TARGET_DEVICE_NAME}"…`);

    this.manager.startDeviceScan(
      null,
      { allowDuplicates: false },
      (error: any, device: any) => {
        if (error) {
          this.diag('error', `Scan error: ${error?.message ?? 'desconhecido'}`);
          this.setState('error');
          return;
        }
        if (!device) return;
        const name = (device.name || device.localName || '').toString();
        if (!name) return;
        // ESP32-C3 firmware advertises exactly "TERESA01".
        if (name.toUpperCase() !== TARGET_DEVICE_NAME) return;
        const existed = this.discoveredDevices.has(device.id);
        this.discoveredDevices.set(device.id, {
          id: device.id,
          name,
          rssi: device.rssi ?? null,
        });
        if (!existed) {
          this.diag('info', `TERESA01 encontrado (${device.id}, ${device.rssi ?? '?'} dBm)`);
        }
        this.emitDevices();
      },
    );

    if (this.scanTimeoutId) clearTimeout(this.scanTimeoutId);
    this.scanTimeoutId = setTimeout(() => {
      if (this.state === 'scanning') {
        this.diag('info', 'Scan expirou (12s).');
        this.stopScan();
      }
    }, SCAN_TIMEOUT_MS);
  }

  stopScan(): void {
    if (this.scanTimeoutId) {
      clearTimeout(this.scanTimeoutId);
      this.scanTimeoutId = null;
    }
    if (!this.manager) return;
    try {
      this.manager.stopDeviceScan();
    } catch {
      // noop
    }
    if (this.state === 'scanning') this.setState('disconnected');
  }

  // --------------------------------------------------------------------------
  async connect(deviceId: string): Promise<void> {
    if (!this.isAvailable()) return;
    this.stopScan();
    this.reconnectAttempts = 0;
    this.lastConnectedDeviceId = deviceId;
    this.diag('info', `Conectando a ${deviceId}…`);
    await this.performConnect(deviceId);
  }

  private async performConnect(deviceId: string): Promise<void> {
    this.setState('connecting');
    try {
      await this.cleanupConnection();
      const device = await this.manager.connectToDevice(deviceId, {
        requestMTU: 185,
      });
      this.diag('info', `BLE link OK (${deviceId}). Descobrindo serviços…`);
      await device.discoverAllServicesAndCharacteristics();
      this.connectedDevice = device;
      this.lastConnectedDeviceId = deviceId;

      this.disconnectSubscription = this.manager.onDeviceDisconnected(
        deviceId,
        (error: any) => {
          this.diag('warn', `Desconexão detectada${error?.message ? ': ' + error.message : ''}`);
          this.handleDisconnect();
        },
      );

      this.subscribeTelemetry();
      // Stay in `connecting` until the first valid frame arrives.
    } catch (e: any) {
      this.diag('error', `Falha ao conectar: ${e?.message ?? e}`);
      this.setState('error');
      this.scheduleReconnect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    this.lastConnectedDeviceId = null;

    await this.cleanupConnection();
    this.lastTelemetry = null;
    this.framesReceived = 0;
    this.lastFrameAt = null;
    this.lastRawFrame = null;
    this.diag('info', 'Desconectado pelo usuário.');
    this.setState('disconnected');
  }

  cancelReconnect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    if (this.state === 'reconnecting') this.setState('disconnected');
    this.diag('info', 'Reconexão automática cancelada.');
  }

  private async cleanupConnection(): Promise<void> {
    if (this.telemetrySubscription) {
      try {
        this.telemetrySubscription.remove();
      } catch {
        /* noop */
      }
      this.telemetrySubscription = null;
    }
    if (this.disconnectSubscription) {
      try {
        this.disconnectSubscription.remove();
      } catch {
        /* noop */
      }
      this.disconnectSubscription = null;
    }
    if (this.telemetryTimeoutId) {
      clearTimeout(this.telemetryTimeoutId);
      this.telemetryTimeoutId = null;
    }
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
      } catch {
        /* noop */
      }
      this.connectedDevice = null;
    }
  }

  // --------------------------------------------------------------------------
  // Telemetry subscription + parser
  // --------------------------------------------------------------------------
  private subscribeTelemetry(): void {
    if (!this.connectedDevice) return;
    try {
      this.telemetrySubscription = this.connectedDevice.monitorCharacteristicForService(
        TERESA_SERVICE_UUID,
        TERESA_TELEMETRY_CHAR,
        (error: any, char: any) => {
          if (error) {
            this.diag('error', `monitor error: ${error?.message ?? 'desconhecido'}`);
            return;
          }
          if (!char?.value) return;
          try {
            const raw = decodeBase64(char.value);
            const parsed = parseTeresaTelemetry(raw);
            if (!parsed) {
              this.diag('warn', `Frame inválido ignorado: "${raw}"`);
              return;
            }
            this.lastTelemetry = parsed;
            this.framesReceived += 1;
            this.lastFrameAt = parsed.received_at;
            this.lastRawFrame = raw;
            if (this.state !== 'connected') {
              this.diag('info', 'Primeiro frame válido recebido — CONECTADO.');
            }
            this.diag('rx', raw);
            this.setState('connected');
            this.reconnectAttempts = 0;
            this.telemetryListeners.forEach((fn) => fn(parsed));
            this.emitMeta();
            this.armTelemetryTimeout();
          } catch (e) {
            this.diag('error', `parse error: ${(e as Error).message}`);
          }
        },
      );
    } catch (e: any) {
      this.diag('error', `subscribe telemetry error: ${e?.message ?? e}`);
    }
  }

  private armTelemetryTimeout(): void {
    if (this.telemetryTimeoutId) clearTimeout(this.telemetryTimeoutId);
    this.telemetryTimeoutId = setTimeout(() => {
      this.diag('warn', `Sem telemetria por ${TELEMETRY_TIMEOUT_MS / 1000}s — assumindo desconexão.`);
      this.handleDisconnect();
    }, TELEMETRY_TIMEOUT_MS);
  }

  // --------------------------------------------------------------------------
  private handleDisconnect(): void {
    if (this.telemetryTimeoutId) {
      clearTimeout(this.telemetryTimeoutId);
      this.telemetryTimeoutId = null;
    }
    if (this.telemetrySubscription) {
      try {
        this.telemetrySubscription.remove();
      } catch {
        /* noop */
      }
      this.telemetrySubscription = null;
    }
    this.lastTelemetry = null;
    this.connectedDevice = null;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.lastConnectedDeviceId) {
      this.setState('disconnected');
      return;
    }
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.diag('error', `Limite de reconexão atingido (${MAX_RECONNECT_ATTEMPTS}). Toque em "Conectar" novamente.`);
      this.setState('disconnected');
      return;
    }
    if (this.reconnectTimeoutId) return;
    this.reconnectAttempts += 1;
    this.setState('reconnecting');
    this.diag(
      'info',
      `Reagendando reconexão (tentativa ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) em ${
        RECONNECT_DELAY_MS / 1000
      }s…`,
    );
    this.emitMeta();
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      if (this.lastConnectedDeviceId) {
        this.performConnect(this.lastConnectedDeviceId);
      }
    }, RECONNECT_DELAY_MS);
  }

  // --------------------------------------------------------------------------
  // Command write — present but intentionally UNUSED in this phase.
  // Firmware's command characteristic exists for future use (start_session,
  // pause_session, etc.) and NO command is sent to the ESP32 right now.
  // --------------------------------------------------------------------------
  async sendCommand(_cmd: Command): Promise<void> {
    // Reserved for future use. The firmware supports WRITE on the command
    // characteristic but does not act on any payload yet, so we keep the
    // channel closed intentionally.
    if (process.env.NODE_ENV !== 'production') {
      console.info('bleService.sendCommand is a no-op in this phase.');
    }
  }
}

// ============================================================================
// Base64 helpers
// ============================================================================
function decodeBase64(b64: string): string {
  if (typeof globalThis.atob === 'function') return globalThis.atob(b64);
  return Buffer.from(b64, 'base64').toString('utf-8');
}

// ============================================================================
// Protocol parser — EXACT match for the firmware output:
//   "TEMP=36.8;HUM=52.4;STATE=EM_TRATAMENTO"
// ============================================================================
export function parseTeresaTelemetry(raw: string): TeresaTelemetry | null {
  if (!raw || typeof raw !== 'string') return null;
  const map = new Map<string, string>();
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toUpperCase();
    const value = part.slice(eq + 1).trim();
    if (key) map.set(key, value);
  }

  const tempStr = map.get('TEMP');
  const humStr = map.get('HUM');
  const stateStr = (map.get('STATE') ?? '').toUpperCase();

  if (!tempStr || !humStr) return null;
  const temperature_c = parseFloat(tempStr);
  const humidity_pct = parseFloat(humStr);
  if (!Number.isFinite(temperature_c) || !Number.isFinite(humidity_pct)) {
    return null;
  }

  const state: TreatmentState = (KNOWN_STATES as readonly string[]).includes(stateStr)
    ? (stateStr as TreatmentState)
    : 'DESCONHECIDO';

  return {
    temperature_c,
    humidity_pct,
    state,
    received_at: new Date().toISOString(),
  };
}

// ============================================================================
// Singleton export
// ============================================================================
export const bleService = new BleService();
