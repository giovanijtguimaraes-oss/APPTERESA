/**
 * BLE Service — Communication layer for T.E.R.E.S.A. ESP32 device.
 *
 * NOTE: react-native-ble-plx requires a native build. It will NOT work in
 * Expo Go. The service exposes a stable interface (scan / connect / send /
 * receive) so screens can use it identically once a native build is made.
 *
 * On Expo Go, methods still resolve (with `null`/empty arrays) so the app
 * doesn't crash — the "Connect Equipment" screen surfaces the environment
 * limitation clearly to the user.
 */

import { Platform } from 'react-native';

export type ConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'error';

export interface BleDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

export interface TeresaTelemetry {
  temperature_c: number;
  humidity_pct: number;
  time_remaining_s: number;
  led_intensity: number;
  ir_intensity: number;
  battery_pct: number;
  session_status: 'idle' | 'running' | 'paused' | 'finished';
  last_error: string | null;
}

// Service / characteristic UUIDs — adjust to match your ESP32 firmware
export const TERESA_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const TERESA_TELEMETRY_CHAR = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
export const TERESA_COMMAND_CHAR = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

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

class BleService {
  private manager: any | null = null;
  private connectedDevice: any | null = null;
  private state: ConnectionState = 'disconnected';
  private stateListeners = new Set<Listener<ConnectionState>>();
  private deviceListeners = new Set<Listener<BleDevice[]>>();
  private telemetryListeners = new Set<Listener<TeresaTelemetry>>();
  private discoveredDevices = new Map<string, BleDevice>();

  private tryLoadManager(): boolean {
    if (this.manager) return true;
    try {
      // Lazy require so Expo Go doesn't crash on module load.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BleManager } = require('react-native-ble-plx');
      this.manager = new BleManager();
      return true;
    } catch (e) {
      console.warn('BLE manager unavailable (Expo Go?):', (e as Error).message);
      return false;
    }
  }

  isAvailable(): boolean {
    if (Platform.OS === 'web') return false;
    return this.tryLoadManager();
  }

  getState(): ConnectionState {
    return this.state;
  }

  private setState(s: ConnectionState): void {
    this.state = s;
    this.stateListeners.forEach((fn) => fn(s));
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
    return () => {
      this.telemetryListeners.delete(fn);
    };
  }

  async startScan(): Promise<void> {
    if (!this.isAvailable()) {
      this.setState('error');
      return;
    }
    this.discoveredDevices.clear();
    this.deviceListeners.forEach((fn) => fn([]));
    this.setState('scanning');

    this.manager.startDeviceScan(
      null,
      { allowDuplicates: false },
      (error: any, device: any) => {
        if (error) {
          console.warn('scan error', error);
          this.setState('error');
          return;
        }
        if (!device) return;
        const isTeresa =
          (device.name && device.name.toString().toUpperCase().includes('TERESA')) ||
          (device.localName &&
            device.localName.toString().toUpperCase().includes('TERESA'));
        // Show T.E.R.E.S.A.-tagged devices only, but keep all named ones for demo.
        if (device.name || isTeresa) {
          this.discoveredDevices.set(device.id, {
            id: device.id,
            name: device.name || device.localName || null,
            rssi: device.rssi ?? null,
          });
          this.deviceListeners.forEach((fn) =>
            fn(Array.from(this.discoveredDevices.values())),
          );
        }
      },
    );

    // Auto-stop after 10s
    setTimeout(() => {
      if (this.state === 'scanning') {
        this.stopScan();
      }
    }, 10000);
  }

  stopScan(): void {
    if (!this.manager) return;
    this.manager.stopDeviceScan();
    if (this.state === 'scanning') this.setState('disconnected');
  }

  async connect(deviceId: string): Promise<void> {
    if (!this.isAvailable()) return;
    this.setState('connecting');
    try {
      const device = await this.manager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();
      this.connectedDevice = device;
      this.setState('connected');
      this.subscribeTelemetry();
    } catch (e) {
      console.warn('connect error', e);
      this.setState('error');
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connectedDevice) return;
    try {
      await this.connectedDevice.cancelConnection();
    } catch (e) {
      // ignore
    }
    this.connectedDevice = null;
    this.setState('disconnected');
  }

  private subscribeTelemetry(): void {
    if (!this.connectedDevice) return;
    try {
      this.connectedDevice.monitorCharacteristicForService(
        TERESA_SERVICE_UUID,
        TERESA_TELEMETRY_CHAR,
        (error: any, char: any) => {
          if (error || !char?.value) return;
          try {
            // Base64 → UTF8 → JSON
            const raw = globalThis.atob
              ? globalThis.atob(char.value)
              : Buffer.from(char.value, 'base64').toString('utf-8');
            const t = JSON.parse(raw) as TeresaTelemetry;
            this.telemetryListeners.forEach((fn) => fn(t));
          } catch (e) {
            console.warn('telemetry parse error', e);
          }
        },
      );
    } catch (e) {
      console.warn('subscribe telemetry error', e);
    }
  }

  async sendCommand(cmd: Command): Promise<void> {
    if (!this.connectedDevice) return;
    try {
      const raw = JSON.stringify(cmd);
      const b64 = globalThis.btoa
        ? globalThis.btoa(raw)
        : Buffer.from(raw, 'utf-8').toString('base64');
      await this.connectedDevice.writeCharacteristicWithResponseForService(
        TERESA_SERVICE_UUID,
        TERESA_COMMAND_CHAR,
        b64,
      );
    } catch (e) {
      console.warn('send command error', e);
    }
  }
}

export const bleService = new BleService();
