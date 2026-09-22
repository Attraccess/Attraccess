import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  request: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  signals: vi.fn(),
  addEvent: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  write: vi.fn(),
  read: vi.fn(),
  main: vi.fn(),
  flashId: vi.fn(),
  writeFlash: vi.fn(),
  loader: vi.fn(),
  connected: true,
}));
vi.mock('esptool-js', () => ({
  Transport: class {
    device = {
      get connected() {
        return state.connected;
      },
      setSignals: state.signals,
    };
    connect = state.connect;
    disconnect = state.disconnect;
    write = state.write;
    rawRead = state.read;
  },
  ESPLoader: class {
    constructor(options: unknown) {
      state.loader(options);
    }
    main = state.main;
    flashId = state.flashId;
    writeFlash = state.writeFlash;
  },
}));
const serialDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serial');
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  state.connected = true;
  for (const fn of [
    state.open,
    state.close,
    state.signals,
    state.connect,
    state.disconnect,
    state.write,
    state.main,
    state.flashId,
    state.writeFlash,
  ])
    fn.mockResolvedValue(undefined);
  state.request.mockResolvedValue({
    open: state.open,
    close: state.close,
    setSignals: state.signals,
    addEventListener: state.addEvent,
  });
  Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: state.request } });
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (serialDescriptor) Object.defineProperty(navigator, 'serial', serialDescriptor);
  else Reflect.deleteProperty(navigator, 'serial');
});
async function instance() {
  return (await import('./esp-tools')).ESPTools.getInstance();
}
it('connects once, emits connection state and handles device disconnect', async () => {
  const esp = await instance();
  expect(await instance()).toBe(esp);
  const listener = vi.fn();
  const throwing = vi.fn(() => {
    throw new Error('Listener failure');
  });
  esp.on('connectionState', listener);
  esp.on('connectionState', throwing);
  expect(await esp.connectToDevice(460800)).toEqual({ success: true, error: null, data: null });
  expect(state.open).toHaveBeenCalledWith({ baudRate: 115200, bufferSize: 8192 });
  expect(state.connect).toHaveBeenCalledWith(460800);
  expect(listener).toHaveBeenCalledWith({ connected: true, timestamp: expect.any(Number) });
  expect(esp.isConnected).toBe(true);
  await esp.connectToDevice();
  expect(state.request).toHaveBeenCalledOnce();
  const disconnect = state.addEvent.mock.calls.find(([event]) => event === 'disconnect')?.[1];
  expect(disconnect).toBeTypeOf('function');
  disconnect();
  expect(esp.isConnected).toBe(false);
  expect(listener).toHaveBeenLastCalledWith({ connected: false, timestamp: expect.any(Number) });
  esp.off('connectionState', throwing);
  esp.off('connectionState', listener);
  esp.off('connectionState', listener);
});
it('distinguishes cancelled selection, port-open failure and connection failure', async () => {
  const esp = await instance();
  const cancelled = new Error('Cancelled');
  cancelled.name = 'NotFoundError';
  state.request.mockRejectedValueOnce(cancelled);
  expect(await esp.connectToDevice()).toMatchObject({
    success: false,
    error: { type: 'NO_PORT_SELECTED', details: 'Cancelled' },
  });
  state.open.mockRejectedValueOnce(new Error('Busy'));
  expect(await esp.connectToDevice()).toMatchObject({
    success: false,
    error: { type: 'PORT_OPEN_FAILED', details: 'Busy' },
  });
  state.request.mockRejectedValueOnce(new Error('Unavailable'));
  expect(await esp.connectToDevice()).toMatchObject({ success: false, error: { type: 'CONNECTION_FAILED' } });
  state.close.mockRejectedValueOnce(new Error('Already closed'));
  expect(await esp.connectToDevice()).toMatchObject({ success: true });
});
it('frames commands and parses matching responses across chunks while ignoring noise and other topics', async () => {
  const esp = await instance();
  state.read.mockImplementation(async (onData: (data: Uint8Array) => void, stop: () => boolean) => {
    const encode = (value: string) => onData(new TextEncoder().encode(value));
    encode('boot log\n\nRESP other {}\nRESP network.status');
    encode('.get {"ready":true}\n');
    expect(stop()).toBe(true);
    encode('RESP network.status.get ignored\n');
  });
  expect(await esp.sendCommand({ topic: 'network.status.get', payload: '{"authCode":"1234"}' })).toBe('{"ready":true}');
  expect(new TextDecoder().decode(state.write.mock.calls[0][0])).toBe(
    'CMND network.status.get {"authCode":"1234"}\n\n',
  );
  state.read.mockClear();
  expect(await esp.sendCommand({ topic: 'restart' }, false)).toBeNull();
  expect(state.read).not.toHaveBeenCalled();
});
it('releases transport ownership after failure and drops a disconnected device', async () => {
  const esp = await instance();
  state.request.mockRejectedValueOnce(new Error('No device'));
  await expect(esp.sendCommand({ topic: 'test' }, false)).rejects.toThrow('Failed to connect to device');
  await esp.connectToDevice();
  state.write.mockRejectedValueOnce(new Error('Write failed'));
  await expect(esp.sendCommand({ topic: 'test' }, false)).rejects.toThrow('Write failed');
  expect(esp.isConnected).toBe(true);
  expect(await esp.sendCommand({ topic: 'retry' }, false)).toBeNull();
  state.connected = false;
  state.write.mockRejectedValueOnce(new Error('Unplugged'));
  await expect(esp.sendCommand({ topic: 'test' }, false)).rejects.toThrow('Unplugged');
  expect(esp.isConnected).toBe(false);
});
it('streams raw output, stops reading and clears connection even when disconnect fails', async () => {
  const esp = await instance();
  let stop!: () => boolean;
  const output = vi.fn();
  state.read.mockImplementation(async (onData: (data: Uint8Array) => void, isStopped: () => boolean) => {
    stop = isStopped;
    onData(new Uint8Array([65]));
  });
  const close = await esp.getSerialOutput(output);
  expect(output).toHaveBeenCalledWith(new Uint8Array([65]));
  expect(stop()).toBe(false);
  await close();
  expect(stop()).toBe(true);
  state.disconnect.mockRejectedValueOnce(new Error('Already closed'));
  await esp.disconnect();
  expect(esp.isConnected).toBe(false);
  await esp.disconnect();
  expect(state.disconnect).toHaveBeenCalledOnce();
});
it('flashes firmware bytes and options, caps transfer progress before completion and resets the device', async () => {
  const esp = await instance();
  const progress = vi.fn();
  state.writeFlash.mockImplementation(
    async (options: { reportProgress: (index: number, written: number, total: number) => void }) => {
      options.reportProgress(0, 1, 2);
      options.reportProgress(0, 2, 2);
    },
  );
  const result = await esp.flashFirmware({
    firmware: new Blob([new Uint8Array([1, 2, 3, 4])]),
    flashMode: 'qio',
    flashFreq: '40m',
    flashSize: '4MB',
    onProgress: progress,
  });
  expect(result.success).toBe(true);
  expect(state.writeFlash).toHaveBeenCalledWith(
    expect.objectContaining({
      fileArray: [{ data: new Uint8Array([1, 2, 3, 4]), address: 0 }],
      flashMode: 'qio',
      flashFreq: '40m',
      flashSize: '4MB',
      compress: true,
      eraseAll: false,
    }),
  );
  expect(progress.mock.calls.map(([value]) => value)).toEqual([50, 99, 100]);
  expect(state.signals.mock.calls.map(([value]) => value.requestToSend)).toEqual([true, false]);
});
it('uses safe flash defaults and reports loader and reset failures', async () => {
  const esp = await instance();
  state.main.mockRejectedValueOnce(new Error('Bootloader unavailable'));
  expect(await esp.flashFirmware({ firmware: new Blob(['image']) })).toMatchObject({
    success: false,
    error: { type: 'FLASH_FAILED', details: 'Bootloader unavailable' },
  });
  state.signals.mockRejectedValueOnce(new Error('Reset unavailable'));
  expect(await esp.flashFirmware({ firmware: new Blob(['image']) })).toMatchObject({
    success: false,
    error: { type: 'RESET_FAILED' },
  });
  expect(state.writeFlash).toHaveBeenCalledWith(
    expect.objectContaining({ flashSize: 'keep', flashMode: 'dio', flashFreq: '80m' }),
  );
});
