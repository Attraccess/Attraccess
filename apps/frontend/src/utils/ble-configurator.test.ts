import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ConnectionStateEvent } from './configurator-transport';

const SERVICE = '2665a001-44cd-4fe2-a450-916b627619d7';

class FakeCharacteristic extends EventTarget {
  value?: DataView;
  writeValueWithResponse = vi.fn(async (_value: BufferSource) => undefined);
  startNotifications = vi.fn(async () => this as unknown as BluetoothRemoteGATTCharacteristic);
  stopNotifications = vi.fn(async () => this as unknown as BluetoothRemoteGATTCharacteristic);

  notify(text: string | Uint8Array) {
    const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
    this.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}

class FakeDevice extends EventTarget {
  rx = new FakeCharacteristic();
  tx = new FakeCharacteristic();
  gatt = {
    connected: false,
    connect: vi.fn(async () => {
      this.gatt.connected = true;
      return this.gatt;
    }),
    disconnect: vi.fn(() => {
      this.gatt.connected = false;
    }),
    getPrimaryService: vi.fn(async () => ({
      getCharacteristic: async (uuid: string) => (uuid.startsWith('2665a002') ? this.rx : this.tx),
    })),
  };

  drop() {
    this.gatt.connected = false;
    this.dispatchEvent(new Event('gattserverdisconnected'));
  }
}

let device: FakeDevice;
const requestDevice = vi.fn();

async function connected() {
  const { BleConfigurator } = await import('./ble-configurator');
  const ble = BleConfigurator.getInstance();
  await expect(ble.connect()).resolves.toBe(true);
  return ble;
}

const written = () =>
  device.rx.writeValueWithResponse.mock.calls.map(([value]) => new TextDecoder().decode(value as Uint8Array));

beforeEach(() => {
  vi.resetModules();
  device = new FakeDevice();
  requestDevice.mockReset().mockResolvedValue(device);
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice } });
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'bluetooth');
});

it('lists readers and bridges in setup mode and subscribes to notifications before the first write', async () => {
  const ble = await connected();
  // The setup service, or a name like "Attractap Touch 71C8", "Attractap Lite 71C8" or "Attractap Bridge 71C8".
  expect(requestDevice).toHaveBeenCalledWith({
    filters: [{ services: [SERVICE] }, { namePrefix: 'Attractap' }],
    optionalServices: [SERVICE],
  });
  expect(device.tx.startNotifications).toHaveBeenCalledOnce();
  expect(ble.isConnected).toBe(true);
  expect(ble.kind).toBe('bluetooth');
});

it('treats a closed device picker as a cancel, not an error', async () => {
  requestDevice.mockRejectedValueOnce(Object.assign(new Error('User cancelled'), { name: 'NotFoundError' }));
  const { BleConfigurator } = await import('./ble-configurator');
  await expect(BleConfigurator.getInstance().connect()).resolves.toBe(false);
  expect(BleConfigurator.getInstance().isConnected).toBe(false);
});

it('splits a long command into writes of at most 180 bytes', async () => {
  const ble = await connected();
  const payload = JSON.stringify({ ssid: 'x'.repeat(200), password: 'y'.repeat(100) });
  await ble.sendCommand({ topic: 'network.wifi.credentials.set', payload }, false);

  const chunks = device.rx.writeValueWithResponse.mock.calls.map(([value]) => (value as Uint8Array).byteLength);
  expect(chunks.length).toBeGreaterThan(1);
  expect(Math.max(...chunks)).toBeLessThanOrEqual(180);
  expect(written().join('')).toBe(`CMND network.wifi.credentials.set ${payload}\n`);
});

it('reassembles a response split over notifications and ignores other topics', async () => {
  const ble = await connected();
  device.rx.writeValueWithResponse.mockImplementationOnce(async () => {
    queueMicrotask(() => {
      device.tx.notify('RESP network.status.get {"wifi":true}\nRESP auth.sta');
      device.tx.notify('tus.get {"pinIs');
      // A multi-byte character split across two notifications.
      const umlaut = new TextEncoder().encode('Set":true,"n":"ä"}\n');
      const split = umlaut.indexOf(0xc3) + 1;
      device.tx.notify(umlaut.slice(0, split));
      device.tx.notify(umlaut.slice(split));
    });
  });
  await expect(ble.sendCommand({ topic: 'auth.status.get' })).resolves.toBe('{"pinIsSet":true,"n":"ä"}');
  expect(written()).toEqual(['CMND auth.status.get\n']);
});

it('resolves null when no response arrives in time', async () => {
  const ble = await connected();
  vi.useFakeTimers();
  const pending = ble.sendCommand({ topic: 'api.status.get' }, true, 5000);
  await vi.advanceTimersByTimeAsync(4999);
  device.tx.notify('RESP other.topic {}\n');
  await vi.advanceTimersByTimeAsync(1);
  await expect(pending).resolves.toBeNull();
});

it('retries a write the link rejected while pairing, then gives up', async () => {
  const ble = await connected();
  vi.useFakeTimers();
  const insecure = () => Object.assign(new Error('GATT operation failed: insufficient encryption'), { name: 'NetworkError' });
  device.rx.writeValueWithResponse.mockRejectedValueOnce(insecure()).mockRejectedValueOnce(insecure());
  const sent = ble.sendCommand({ topic: 'auth.status.get' }, false);
  await vi.advanceTimersByTimeAsync(2000);
  await expect(sent).resolves.toBeNull();
  expect(device.rx.writeValueWithResponse).toHaveBeenCalledTimes(3);

  // Long enough for a person to accept the OS pairing prompt, then it gives up.
  const { SECURITY_RETRIES } = await import('./ble-configurator');
  expect(SECURITY_RETRIES).toBeGreaterThanOrEqual(30);
  device.rx.writeValueWithResponse.mockReset().mockRejectedValue(insecure());
  const failing = ble.sendCommand({ topic: 'auth.status.get' }, false);
  const assertion = expect(failing).rejects.toThrow('insufficient encryption');
  await vi.advanceTimersByTimeAsync(SECURITY_RETRIES * 1000);
  await assertion;
  expect(device.rx.writeValueWithResponse).toHaveBeenCalledTimes(SECURITY_RETRIES + 1);
});

it('does not retry other write errors', async () => {
  const ble = await connected();
  device.rx.writeValueWithResponse.mockRejectedValueOnce(new TypeError('bad value'));
  await expect(ble.sendCommand({ topic: 'auth.status.get' }, false)).rejects.toThrow('bad value');
  expect(device.rx.writeValueWithResponse).toHaveBeenCalledOnce();
});

it('reports a drop after the reader was authenticated as expected, other drops plainly', async () => {
  const ble = await connected();
  const events: ConnectionStateEvent[] = [];
  ble.on('connectionState', (event) => events.push(event));

  device.rx.writeValueWithResponse.mockImplementationOnce(async () => {
    queueMicrotask(() => device.tx.notify('RESP api.status.get {"status":"authenticated"}\n'));
  });
  await ble.sendCommand({ topic: 'api.status.get' });
  device.drop();
  expect(events.at(-1)).toMatchObject({ connected: false, closedAfterPairing: true });
  expect(ble.isConnected).toBe(false);
  await expect(ble.sendCommand({ topic: 'api.status.get' })).rejects.toThrow('NOT_CONNECTED');

  await expect(ble.connect()).resolves.toBe(true);
  expect(events.at(-1)).toMatchObject({ connected: true });
  device.drop();
  expect(events.at(-1)?.closedAfterPairing).toBeUndefined();
  expect(events.at(-1)?.lost).toBe(true);

  await expect(ble.connect()).resolves.toBe(true);
  await ble.disconnect();
  expect(events.at(-1)).toMatchObject({ connected: false });
  expect(events.at(-1)?.lost).toBeUndefined();
});

it('answers a pending command with null when the link drops', async () => {
  const ble = await connected();
  const pending = ble.sendCommand({ topic: 'api.status.get' });
  await vi.waitFor(() => expect(device.rx.writeValueWithResponse).toHaveBeenCalled());
  device.drop();
  await expect(pending).resolves.toBeNull();
});

it('detects Web Bluetooth only in a secure context', async () => {
  const { isWebBluetoothAvailable } = await import('./ble-configurator');
  const secure = (value: boolean) => Object.defineProperty(window, 'isSecureContext', { configurable: true, value });
  secure(true);
  expect(isWebBluetoothAvailable()).toBe(true);
  secure(false);
  expect(isWebBluetoothAvailable()).toBe(false);
  Reflect.deleteProperty(navigator, 'bluetooth');
  secure(true);
  expect(isWebBluetoothAvailable()).toBe(false);
});
