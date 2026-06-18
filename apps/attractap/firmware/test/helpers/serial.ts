import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { EventEmitter } from 'events';

let _port: SerialPort | null = null;
let _parser: ReadlineParser | null = null;
const _emitter = new EventEmitter();
_emitter.setMaxListeners(50);

export function getSerialPath(): string {
  const p = process.env.ATTRACTAP_SERIAL_PORT;
  if (!p) {
    throw new Error(
      'ATTRACTAP_SERIAL_PORT environment variable must be set (e.g. /dev/ttyUSB0)'
    );
  }
  return p;
}

export async function openSerial(): Promise<void> {
  if (_port?.isOpen) return;

  _port = new SerialPort({
    path: getSerialPath(),
    baudRate: 115_200,
    autoOpen: false,
  });

  await new Promise<void>((resolve, reject) => {
    _port!.open((err?: Error | null) => (err ? reject(err) : resolve()));
  });

  _parser = _port.pipe(new ReadlineParser({ delimiter: '\n' }));
  _parser.on('data', (line: string) => {
    _emitter.emit('line', line.trimEnd());
  });
}

export async function closeSerial(): Promise<void> {
  if (!_port?.isOpen) return;
  await new Promise<void>((resolve, reject) => {
    _port!.close((err?: Error | null) => (err ? reject(err) : resolve()));
  });
  _port = null;
  _parser = null;
}

/**
 * Wait until a serial line matching `pattern` arrives.
 * Returns the full matching line.
 */
export function waitForSerialMessage(
  pattern: string | RegExp,
  timeout = 30_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _emitter.off('line', handler);
      reject(
        new Error(
          `Timeout waiting for serial message matching ${String(pattern)} after ${timeout}ms`
        )
      );
    }, timeout);

    function handler(line: string) {
      const matched =
        typeof pattern === 'string' ? line.includes(pattern) : pattern.test(line);
      if (matched) {
        clearTimeout(timer);
        _emitter.off('line', handler);
        resolve(line);
      }
    }

    _emitter.on('line', handler);
  });
}

/**
 * Low-level: write `CMND <topic> <jsonPayload>\n` and await `RESP <topic> ...`.
 * Returns the parsed JSON response object.
 */
export async function sendSerialCommand<T = Record<string, unknown>>(
  topic: string,
  payload: Record<string, unknown> = {},
  timeout = 15_000
): Promise<T> {
  if (!_port?.isOpen) {
    throw new Error('Serial port is not open. Call openSerial() first.');
  }

  const cmd = `CMND ${topic} ${JSON.stringify(payload)}\n`;
  await new Promise<void>((resolve, reject) => {
    _port!.write(cmd, (err?: Error | null) => (err ? reject(err) : resolve()));
  });

  const respLine = await waitForSerialMessage(new RegExp(`^RESP ${topic} `), timeout);
  const jsonPart = respLine.slice(`RESP ${topic} `.length);
  return JSON.parse(jsonPart) as T;
}

/**
 * Write raw bytes to the already-open serial port without waiting for a response.
 * Useful for commands that cause an immediate device crash/reboot (e.g. debug.crash).
 */
export async function writeSerialRaw(data: string): Promise<void> {
  if (!_port?.isOpen) {
    throw new Error('Serial port is not open. Call openSerial() first.');
  }
  await new Promise<void>((resolve, reject) => {
    _port!.write(data, (err?: Error | null) => (err ? reject(err) : resolve()));
  });
  await new Promise<void>((resolve, reject) => {
    _port!.drain((err?: Error | null) => (err ? reject(err) : resolve()));
  });
}

export interface DeviceConfig {
  hostname: string;
  port: number;
  useSSL: boolean;
  /** 4-digit PIN. Used to set it on a fresh device or authenticate on an existing one. */
  pin: string;
}

/**
 * High-level: configure the device over serial for a test run.
 * Sets PIN (if not yet set) and API connection details.
 */
export async function configureDeviceViaSerial(config: DeviceConfig): Promise<void> {
  const authStatus = await sendSerialCommand<{ pinIsSet: boolean }>('auth.status.get');

  if (!authStatus.pinIsSet) {
    await sendSerialCommand('auth.code.set', { newCode: config.pin });
  }

  // api.configuration.set requires authCode when PIN is set
  await sendSerialCommand('api.configuration.set', {
    hostname: config.hostname,
    port: config.port,
    useSSL: config.useSSL,
    authCode: config.pin,
  });
}
