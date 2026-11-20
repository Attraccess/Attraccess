import { Mutex } from 'async-mutex';
import {
  parseResponseLine,
  type Command,
  type ConfiguratorTransport,
  type ConnectionStateEvent,
} from './configurator-transport';

/**
 * GATT service of the Attractap Bluetooth setup, on readers and BLE Bridges alike. A device advertises it only while
 * its setup window is open (an unpaired reader after boot, a Touch's "Bluetooth setup" button, the bridge's 3 s hold).
 */
export const SETUP_SERVICE_UUID = '2665a001-44cd-4fe2-a450-916b627619d7';
/** Client → device: `CMND` lines, written with response. Needs an encrypted link (Just Works pairing). */
export const SETUP_RX_CHARACTERISTIC_UUID = '2665a002-44cd-4fe2-a450-916b627619d7';
/** Device → client: `RESP` lines, split across notifications of any size. */
export const SETUP_TX_CHARACTERISTIC_UUID = '2665a003-44cd-4fe2-a450-916b627619d7';
/** Advertised names: "Attractap Touch 71C8", "Attractap Lite 71C8", "Attractap Bridge 71C8". */
export const SETUP_NAME_PREFIX = 'Attractap';

/** Largest single GATT write; a longer command line is split into several sequential writes. */
export const MAX_WRITE_CHUNK_BYTES = 180;
/** The first write triggers OS pairing, which can reject a write or two until the link is encrypted. */
const SECURITY_RETRIES = 3;
const SECURITY_RETRY_DELAY_MS = 1000;
/** Inbound lines are at most 256 bytes; a buffer far beyond that without a newline is garbage. */
const MAX_LINE_BUFFER_CHARS = 4096;

/** Web Bluetooth needs a secure context and Chrome or Edge (desktop or Android). */
export function isWebBluetoothAvailable(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return window.isSecureContext && !!navigator.bluetooth;
}

/** Chrome reports a write on a not yet encrypted link as one of these, depending on the platform. */
function isSecurityError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (['NetworkError', 'NotSupportedError', 'SecurityError', 'NotAllowedError'].includes(err.name)) return true;
  return /encrypt|authenticat|insufficient|security/i.test(err.message);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type LineListener = (line: string) => void;

/** The Attractap configurator over Web Bluetooth (readers and BLE Bridges); the same line protocol as over serial. */
export class BleConfigurator implements ConfiguratorTransport {
  public readonly kind = 'bluetooth' as const;

  private static _instance: BleConfigurator | undefined;

  public static getInstance(): BleConfigurator {
    if (!BleConfigurator._instance) {
      BleConfigurator._instance = new BleConfigurator();
    }
    return BleConfigurator._instance;
  }

  private constructor() {
    // Singleton, like ESPTools.
  }

  private device: BluetoothDevice | null = null;
  private rx: BluetoothRemoteGATTCharacteristic | null = null;
  private tx: BluetoothRemoteGATTCharacteristic | null = null;
  private readonly mutex = new Mutex();
  private decoder = new TextDecoder();
  private lineBuffer = '';
  private readonly lineListeners = new Set<LineListener>();
  private readonly pendingAborts = new Set<() => void>();
  private readonly listeners = new Set<(event: ConnectionStateEvent) => void>();
  /** The last `status` the device reported for api.status.get; `authenticated` makes the coming disconnect expected. */
  private lastApiStatus: string | null = null;

  public get isConnected(): boolean {
    return !!this.rx && !!this.device?.gatt?.connected;
  }

  /**
   * Opens the browser's device picker and connects to the chosen reader or bridge.
   * Resolves false when the user closed the picker; rejects when connecting failed.
   */
  public async connect(): Promise<boolean> {
    if (this.isConnected) return true;
    if (!navigator.bluetooth) throw new Error('WEB_BLUETOOTH_UNAVAILABLE');

    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SETUP_SERVICE_UUID] }, { namePrefix: SETUP_NAME_PREFIX }],
        optionalServices: [SETUP_SERVICE_UUID],
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'NotFoundError') return false;
      throw err;
    }

    device.addEventListener('gattserverdisconnected', this.handleDisconnected);
    try {
      if (!device.gatt) throw new Error('GATT_UNAVAILABLE');
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SETUP_SERVICE_UUID);
      const rx = await service.getCharacteristic(SETUP_RX_CHARACTERISTIC_UUID);
      const tx = await service.getCharacteristic(SETUP_TX_CHARACTERISTIC_UUID);

      this.resetStream();
      tx.addEventListener('characteristicvaluechanged', this.handleNotification);
      // Subscribe before the first write so no response is missed.
      const subscribe = () => tx.startNotifications();
      const deviceConnected = () => !!device.gatt?.connected;
      await this.withSecurityRetry(subscribe, deviceConnected);

      this.device = device;
      this.rx = rx;
      this.tx = tx;
    } catch (err) {
      device.removeEventListener('gattserverdisconnected', this.handleDisconnected);
      device.gatt?.disconnect();
      throw err;
    }

    this.emit({ connected: true, timestamp: Date.now() });
    return true;
  }

  public async sendCommand(command: Command, waitForResponse = true, timeout = 15000): Promise<string | null> {
    const release = await this.mutex.acquire();
    let listener: LineListener | undefined;
    let abort: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const rx = this.rx;
      if (!rx || !this.isConnected) throw new Error('NOT_CONNECTED');

      let resolveResult: (value: string | null) => void = () => undefined;
      const result = new Promise<string | null>((resolve) => {
        resolveResult = resolve;
      });
      if (waitForResponse) {
        listener = (line) => {
          const response = parseResponseLine(line);
          if (response?.topic === command.topic) resolveResult(response.payload);
        };
        abort = () => resolveResult(null);
        this.lineListeners.add(listener);
        this.pendingAborts.add(abort);
      }

      const line = `CMND ${command.topic}${command.payload ? ` ${command.payload}` : ''}\n`;
      await this.writeLine(rx, new TextEncoder().encode(line));

      if (!waitForResponse) return null;
      timer = setTimeout(() => resolveResult(null), timeout);
      return await result;
    } finally {
      clearTimeout(timer);
      if (listener) this.lineListeners.delete(listener);
      if (abort) this.pendingAborts.delete(abort);
      release();
    }
  }

  public async disconnect(): Promise<void> {
    const device = this.device;
    if (!device) return;
    device.removeEventListener('gattserverdisconnected', this.handleDisconnected);
    try {
      await this.tx?.stopNotifications();
    } catch (err) {
      console.debug('Failed to stop Bluetooth setup notifications', err);
    }
    device.gatt?.disconnect();
    this.teardown(false);
  }

  public on(event: 'connectionState', listener: (event: ConnectionStateEvent) => void): void {
    this.listeners.add(listener);
  }

  public off(event: 'connectionState', listener: (event: ConnectionStateEvent) => void): void {
    this.listeners.delete(listener);
  }

  private async writeLine(rx: BluetoothRemoteGATTCharacteristic, bytes: Uint8Array): Promise<void> {
    for (let offset = 0; offset < bytes.length; offset += MAX_WRITE_CHUNK_BYTES) {
      const chunk = bytes.slice(offset, offset + MAX_WRITE_CHUNK_BYTES);
      await this.withSecurityRetry(
        () => rx.writeValueWithResponse(chunk),
        () => this.isConnected,
      );
    }
  }

  private async withSecurityRetry<T>(operation: () => Promise<T>, stillConnected: () => boolean): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (err) {
        if (attempt >= SECURITY_RETRIES || !isSecurityError(err) || !stillConnected()) throw err;
        console.debug('The device rejected the operation while pairing, retrying', err);
        await delay(SECURITY_RETRY_DELAY_MS);
      }
    }
  }

  private readonly handleNotification = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic | null)?.value;
    if (!value) return;
    this.lineBuffer += this.decoder.decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), {
      stream: true,
    });

    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() ?? '';
    if (this.lineBuffer.length > MAX_LINE_BUFFER_CHARS) this.lineBuffer = '';

    for (const line of lines) {
      if (!line.trim()) continue;
      this.trackApiStatus(line);
      this.lineListeners.forEach((listener) => listener(line));
    }
  };

  private trackApiStatus(line: string) {
    const response = parseResponseLine(line);
    if (response?.topic !== 'api.status.get') return;
    try {
      const status = (JSON.parse(response.payload) as { status?: unknown }).status;
      if (typeof status === 'string') this.lastApiStatus = status;
    } catch {
      // Not a status object (e.g. an error string); keep the last known status.
    }
  }

  private readonly handleDisconnected = () => {
    // During connect() the failure path cleans up; only a link that was up reports a disconnect.
    if (!this.rx) return;
    this.device?.removeEventListener('gattserverdisconnected', this.handleDisconnected);
    const closedAfterPairing = this.lastApiStatus === 'authenticated';
    this.teardown(closedAfterPairing, !closedAfterPairing);
  };

  private teardown(closedAfterPairing: boolean, lost = false) {
    this.tx?.removeEventListener('characteristicvaluechanged', this.handleNotification);
    this.device = null;
    this.rx = null;
    this.tx = null;
    this.pendingAborts.forEach((abort) => abort());
    this.resetStream();
    this.emit({
      connected: false,
      timestamp: Date.now(),
      ...(closedAfterPairing ? { closedAfterPairing } : {}),
      ...(lost ? { lost } : {}),
    });
  }

  private resetStream() {
    this.decoder = new TextDecoder();
    this.lineBuffer = '';
    this.lastApiStatus = null;
  }

  private emit(event: ConnectionStateEvent) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in a Bluetooth connection state listener', err);
      }
    });
  }
}
