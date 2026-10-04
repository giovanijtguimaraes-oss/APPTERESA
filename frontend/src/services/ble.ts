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

import { Platform } from 'react-native';

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
 */
export type ConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
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

/** Command payloads (not sent in this phase — reserved for future). */
export type Command =
  | { type: 'start_session' }
  | { type: 'pause_session' }
  | { type: 'stop_session' };

type Listener<T> = (v: T) => void;

// ============================================================================
// Tunables
// ============================================================================
const TELEMETRY_TIMEOUT_MS = 10_000; // ESP32 sends every ~1s; 10s silence ⇒ dead
const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const SCAN_TIMEOUT_MS = 10_000;

// ============================================================================
// Service implementation
// ============================================================================
class BleService {
  private manager: any | null = null;
  private connectedDevice: any | null = null;
  private lastConnectedDeviceId: string | null = null;

  private state: ConnectionState = 'disconnected';
  private lastTelemetry: TeresaTelemetry | null = null;

  private stateListeners = new Set<Listener<ConnectionState>>();
  private deviceListeners = new Set<Listener<BleDevice[]>>();
  private telemetryListeners = new Set<Listener<TeresaTelemetry>>();
  private discoveredDevices = new Map<string, BleDevice>();

  private telemetryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private scanTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  private telemetrySubscription: any | null = null;
  private disconnectSubscription: any | null = null;

  // --------------------------------------------------------------------------
  private tryLoadManager(): boolean {
    if (this.manager) return true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BleManager } = require('react-native-ble-plx');
      this.manager = new BleManager();
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

  private setState(s: ConnectionState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateListeners.forEach((fn) => fn(s));
  }

  private emitDevices(): void {
    const list = Array.from(this.discoveredDevices.values());
    this.deviceListeners.forEach((fn) => fn(list));
  }

  // --------------------------------------------------------------------------
  // Scan — only surface devices whose advertised name is TERESA01
  // --------------------------------------------------------------------------
  async startScan(): Promise<void> {
    if (!this.isAvailable()) {
      this.setState('error');
      return;
    }
    this.discoveredDevices.clear();
    this.emitDevices();
    this.setState('scanning');

    this.manager.startDeviceScan(
      null,
      { allowDuplicates: false },
      (error: any, device: any) => {
        if (error) {
          console.warn('BLE scan error', error);
          this.setState('error');
          return;
        }
        if (!device) return;
        const name = (device.name || device.localName || '').toString();
        if (!name) return;
        // ESP32-C3 firmware advertises exactly "TERESA01".
        if (name.toUpperCase() !== TARGET_DEVICE_NAME) return;
        this.discoveredDevices.set(device.id, {
          id: device.id,
          name,
          rssi: device.rssi ?? null,
        });
        this.emitDevices();
      },
    );

    if (this.scanTimeoutId) clearTimeout(this.scanTimeoutId);
    this.scanTimeoutId = setTimeout(() => {
      if (this.state === 'scanning') this.stopScan();
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
    await this.performConnect(deviceId);
  }

  private async performConnect(deviceId: string): Promise<void> {
    this.setState('connecting');
    try {
      await this.cleanupConnection();
      const device = await this.manager.connectToDevice(deviceId, {
        requestMTU: 185,
      });
      await device.discoverAllServicesAndCharacteristics();
      this.connectedDevice = device;
      this.lastConnectedDeviceId = deviceId;

      this.disconnectSubscription = this.manager.onDeviceDisconnected(
        deviceId,
        (error: any) => {
          console.warn('BLE device disconnected', error?.message);
          this.handleDisconnect();
        },
      );

      this.subscribeTelemetry();
      // Stay in `connecting` until the first valid frame arrives.
    } catch (e) {
      console.warn('BLE connect error', e);
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
    this.setState('disconnected');
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
            console.warn('telemetry monitor error', error.message);
            return;
          }
          if (!char?.value) return;
          try {
            const raw = decodeBase64(char.value);
            const parsed = parseTeresaTelemetry(raw);
            if (!parsed) return;
            this.lastTelemetry = parsed;
            this.setState('connected');
            this.telemetryListeners.forEach((fn) => fn(parsed));
            this.armTelemetryTimeout();
          } catch (e) {
            console.warn('telemetry parse error', e);
          }
        },
      );
    } catch (e) {
      console.warn('subscribe telemetry error', e);
    }
  }

  private armTelemetryTimeout(): void {
    if (this.telemetryTimeoutId) clearTimeout(this.telemetryTimeoutId);
    this.telemetryTimeoutId = setTimeout(() => {
      console.warn('telemetry timeout — treating as disconnected');
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
    this.setState('disconnected');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.lastConnectedDeviceId) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    if (this.reconnectTimeoutId) return;
    this.reconnectAttempts += 1;
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Buffer } = require('buffer');
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
