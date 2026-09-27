/**
 * BLE Service — Communication layer for the T.E.R.E.S.A. ESP32 Mini.
 *
 * Requirements (per project spec):
 *  - Only discover the ESP32 advertised as "TERESA01".
 *  - Connection is only "ativa" after receiving valid telemetry (temperature +
 *    humidity) from the device — Bluetooth on with no ESP32 does NOT count.
 *  - Detect disconnection (BLE-level and telemetry timeout) and auto-reconnect
 *    a bounded number of times.
 *  - Modular: no BLE code outside this file, no UUIDs elsewhere.
 *
 * Notes:
 *  - `react-native-ble-plx` is loaded lazily so the app does not crash in
 *    Expo Go / web / Node during Metro bundling. When the module is not
 *    available (Expo Go), `isAvailable()` returns false and every method
 *    is a no-op — screens surface this to the user.
 *  - A native development / production build is required for real BLE to
 *    work. Instructions live in /app/ESP32_FIRMWARE.md.
 */

import { Platform } from 'react-native';

// ============================================================================
// FIRMWARE CONFIG — align these UUIDs with the ESP32 Arduino sketch.
// Placeholders below use the well-known Nordic-UART UUIDs. If the T.E.R.E.S.A.
// firmware defines different UUIDs, change ONLY these constants. Do NOT sprinkle
// UUIDs anywhere else in the codebase.
// ============================================================================
export const TARGET_DEVICE_NAME = 'TERESA01';
export const TERESA_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const TERESA_TELEMETRY_CHAR = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // notify
export const TERESA_COMMAND_CHAR = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // write

// ============================================================================
// Public types
// ============================================================================

/**
 * `connected` means BLE is linked AND we're actually receiving valid telemetry.
 * `connecting` covers both the initial handshake and the window between a
 * successful BLE link and the first telemetry frame.
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
  /** ESP32-reported status. Normalized to upper case. "ON" / "OFF" / etc. */
  status: string;
  time_remaining_s?: number;
  led_intensity?: number;
  ir_intensity?: number;
  battery_pct?: number;
  session_status?: string;
  last_error?: string | null;
  /** ISO timestamp when the app received the frame. */
  received_at: string;
}

export type Command =
  | { type: 'start_session' }
  | { type: 'pause_session' }
  | { type: 'stop_session' }
  | { type: 'set_led_intensity'; value: number }
  | { type: 'set_ir_intensity'; value: number }
  | { type: 'set_protocol'; id: string }
  | { type: 'sync_time'; iso: string }
  | { type: 'request_report' };

type Listener<T> = (v: T) => void;

// ============================================================================
// Tunables
// ============================================================================
const TELEMETRY_TIMEOUT_MS = 30_000; // no data in 30s ⇒ mark disconnected
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
  // Availability / lazy manager loading
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
  // Public getters / subscriptions
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
  // Scanning — only surface devices whose advertised name matches TERESA01
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
        // Match TERESA01 (case-insensitive, allow optional suffix like _01).
        const upper = name.toUpperCase();
        if (!upper.startsWith(TARGET_DEVICE_NAME)) return;
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
  // Connect / disconnect
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
        // Larger MTU keeps telemetry frames in one chunk.
        requestMTU: 185,
      });
      await device.discoverAllServicesAndCharacteristics();
      this.connectedDevice = device;
      this.lastConnectedDeviceId = deviceId;

      // Register the disconnect listener BEFORE subscribing telemetry so we
      // catch cable/power loss between the two steps.
      this.disconnectSubscription = this.manager.onDeviceDisconnected(
        deviceId,
        (error: any) => {
          console.warn('BLE device disconnected', error?.message);
          this.handleDisconnect();
        },
      );

      this.subscribeTelemetry();
      // Stay in `connecting` state until the first valid telemetry arrives —
      // real connection is only "ativa" enquanto recebemos dados válidos.
    } catch (e) {
      console.warn('BLE connect error', e);
      this.setState('error');
      this.scheduleReconnect();
    }
  }

  async disconnect(): Promise<void> {
    // User-initiated: stop trying to reconnect.
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // block auto-retry
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
        // noop
      }
      this.telemetrySubscription = null;
    }
    if (this.disconnectSubscription) {
      try {
        this.disconnectSubscription.remove();
      } catch {
        // noop
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
        // noop — device may already be gone.
      }
      this.connectedDevice = null;
    }
  }

  // --------------------------------------------------------------------------
  // Telemetry pipeline
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
            const parsed = parseTelemetryPayload(raw);
            if (!parsed) return;
            this.lastTelemetry = parsed;
            // Only NOW consider the connection truly active.
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
  // Disconnection & reconnection
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
        // noop
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
  // Commands (write to command characteristic)
  // --------------------------------------------------------------------------
  async sendCommand(cmd: Command): Promise<void> {
    if (!this.connectedDevice) return;
    try {
      const raw = JSON.stringify(cmd);
      const b64 = encodeBase64(raw);
      await this.connectedDevice.writeCharacteristicWithResponseForService(
        TERESA_SERVICE_UUID,
        TERESA_COMMAND_CHAR,
        b64,
      );
    } catch (e) {
      console.warn('BLE send command error', e);
    }
  }
}

// ============================================================================
// Base64 helpers (support RN and web fallbacks)
// ============================================================================
function decodeBase64(b64: string): string {
  if (typeof globalThis.atob === 'function') return globalThis.atob(b64);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Buffer } = require('buffer');
  return Buffer.from(b64, 'base64').toString('utf-8');
}

function encodeBase64(raw: string): string {
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(raw);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Buffer } = require('buffer');
  return Buffer.from(raw, 'utf-8').toString('base64');
}

// ============================================================================
// Telemetry payload parser (JSON with flexible casing)
// ============================================================================
function parseTelemetryPayload(raw: string): TeresaTelemetry | null {
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;

  const temp =
    obj.temperature_c ??
    obj.temperature ??
    obj.TEMPERATURE ??
    obj.temp ??
    null;
  const hum =
    obj.humidity_pct ??
    obj.humidity ??
    obj.HUMIDITY ??
    obj.hum ??
    null;
  const rawStatus = obj.status ?? obj.STATUS ?? obj.session_status ?? 'ON';

  const tNum = typeof temp === 'number' ? temp : parseFloat(temp);
  const hNum = typeof hum === 'number' ? hum : parseFloat(hum);
  if (!Number.isFinite(tNum) || !Number.isFinite(hNum)) return null;

  return {
    temperature_c: tNum,
    humidity_pct: hNum,
    status: String(rawStatus).toUpperCase(),
    time_remaining_s: numOrUndef(obj.time_remaining_s ?? obj.time_remaining),
    led_intensity: numOrUndef(obj.led_intensity),
    ir_intensity: numOrUndef(obj.ir_intensity),
    battery_pct: numOrUndef(obj.battery_pct ?? obj.battery),
    session_status: obj.session_status,
    last_error: obj.last_error ?? null,
    received_at: new Date().toISOString(),
  };
}

function numOrUndef(v: any): number | undefined {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

// ============================================================================
// Singleton export
// ============================================================================
export const bleService = new BleService();
