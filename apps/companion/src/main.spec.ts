import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { createHash } from 'crypto';
import { app, ipcMain } from 'electron';
import * as https from 'https';
import * as fs from 'fs';
import { CompanionWsClient } from '@attraccess/companion-ws-client';
import { state } from './state';
import { osAdapter } from './platform-adapter';
import { loadCredentials, loadPin, saveCredentials } from './keychain';
import { openWizardWindow } from './wizard-window';
import { showKioskOverlay, hideKioskOverlay } from './kiosk';
import { startIdleDetection } from './idle-detection';
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn(() => ({ then: jest.fn() })),
    on: jest.fn(),
    getVersion: () => '1.0.0',
    getPath: () => '/fixture-temp',
    quit: jest.fn(),
  },
  ipcMain: { handle: jest.fn() },
}));
jest.mock('https', () => ({ get: jest.fn() }));
jest.mock('http', () => ({ get: jest.fn() }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createWriteStream: jest.fn(),
  createReadStream: jest.fn(),
  unlink: jest.fn(),
}));
jest.mock('@attraccess/companion-ws-client', () => ({ CompanionWsClient: jest.fn(() => makeSocket()) }));
jest.mock('./keychain', () => ({
  loadCredentials: jest.fn(),
  loadPin: jest.fn(),
  saveCredentials: jest.fn(),
  savePin: jest.fn(),
  clearCredentials: jest.fn(),
}));
jest.mock('./platform-adapter', () => ({
  osAdapter: {
    permissionsStatus: jest.fn(),
    requestPermissions: jest.fn(),
    installStartupEntry: jest.fn().mockResolvedValue(undefined),
    updateExtension: '.bin',
    applyUpdate: jest.fn(),
  },
}));
jest.mock('./settings', () => ({
  SETTINGS_DEFAULTS: { idleTimeoutMinutes: 15, foregroundApp: true, usbDevices: true },
  loadSettings: jest.fn().mockReturnValue({ idleTimeoutMinutes: 15, foregroundApp: true, usbDevices: true }),
  saveSettings: jest.fn(),
}));
jest.mock('./idle-detection', () => ({ startIdleDetection: jest.fn(), stopIdleDetection: jest.fn() }));
jest.mock('./foreground-app', () => ({
  startForegroundAppMonitoring: jest.fn(),
  stopForegroundAppMonitoring: jest.fn(),
}));
jest.mock('./usb-devices', () => ({ startUsbDevicesMonitoring: jest.fn(), stopUsbDevicesMonitoring: jest.fn() }));
jest.mock('./kiosk', () => ({
  openKiosk: jest.fn(),
  reloadKiosk: jest.fn(),
  lockComputer: jest.fn(),
  unlockComputer: jest.fn(),
  showKioskOverlay: jest.fn(),
  hideKioskOverlay: jest.fn(),
}));
jest.mock('./tray', () => ({ setupTray: jest.fn(), setTrayState: jest.fn() }));
jest.mock('./wizard-window', () => ({ openWizardWindow: jest.fn() }));
function makeSocket() {
  return Object.assign(new EventEmitter(), {
    stop: jest.fn(),
    connect: jest.fn(),
    sendRegister: jest.fn(),
    sendAuthenticate: jest.fn(),
  });
}
let handlers: Map<string, (...args: unknown[]) => unknown>;
let lifecycle: Map<string, (...args: unknown[]) => unknown>;
let ready: () => Promise<void>;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
beforeAll(() => {
  require('./main');
  handlers = new Map(
    jest.mocked(ipcMain.handle).mock.calls.map(([name, handler]) => [name, handler as (...args: unknown[]) => unknown]),
  );
  lifecycle = new Map(
    jest.mocked(app.on).mock.calls.map(([name, handler]) => [name, handler as (...args: unknown[]) => unknown]),
  );
  // Read the actual promise-like object used at module initialization.
  ready = (jest.mocked(app.whenReady).mock.results[0].value as unknown as { then: jest.Mock }).then.mock.calls[0][0];
});
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(state, {
    creds: null,
    pinHash: null,
    wsClient: null,
    mainWindow: null,
    authenticatedPayload: null,
    updateInProgress: false,
    allowQuit: false,
    kioskLocked: false,
    adminOverride: false,
    serverLocked: false,
    tray: { setToolTip: jest.fn() },
  });
  jest.mocked(osAdapter.permissionsStatus).mockReturnValue({ needed: false, accessibility: true });
  jest.mocked(osAdapter.installStartupEntry).mockResolvedValue(undefined);
  jest.mocked(osAdapter.applyUpdate).mockResolvedValue(undefined);
  jest.mocked(loadCredentials).mockResolvedValue(null);
  jest.mocked(loadPin).mockResolvedValue(null);
  jest
    .mocked(fs.createWriteStream)
    .mockImplementation(
      () =>
        Object.assign(new EventEmitter(), { close: (callback?: () => void) => callback?.() }) as ReturnType<
          typeof fs.createWriteStream
        >,
    );
  jest
    .mocked(fs.createReadStream)
    .mockImplementation(() => Readable.from([Buffer.from('fixture-update')]) as ReturnType<typeof fs.createReadStream>);
  jest.mocked(https.get).mockImplementation((...args: unknown[]) => {
    const callback = args.at(-1) as (response: unknown) => void;
    const request = Object.assign(new EventEmitter(), { setTimeout: jest.fn(), destroy: jest.fn() });
    queueMicrotask(() =>
      callback({ statusCode: 200, pipe: (file: EventEmitter) => queueMicrotask(() => file.emit('finish')) }),
    );
    return request as unknown as ReturnType<typeof https.get>;
  });
});
async function register() {
  await handlers.get('register')?.(null, 'https://workspace.test');
  return jest.mocked(CompanionWsClient).mock.results.at(-1)?.value as ReturnType<typeof makeSocket>;
}
it('opens setup for missing credentials or PIN and connects only when both exist', async () => {
  await ready();
  expect(openWizardWindow).toHaveBeenCalledTimes(1);
  expect(CompanionWsClient).not.toHaveBeenCalled();
  jest.mocked(loadCredentials).mockResolvedValue({ id: 4, token: 'fixture', serverUrl: 'https://workspace.test' });
  await ready();
  expect(openWizardWindow).toHaveBeenCalledTimes(2);
  expect(CompanionWsClient).not.toHaveBeenCalled();
  jest.mocked(loadPin).mockResolvedValue('fixture-hash');
  await ready();
  expect(CompanionWsClient).toHaveBeenCalledWith('https://workspace.test');
});
it('registers then authenticates immediately and restores the server lock state', async () => {
  const socket = await register();
  socket.emit('connected');
  expect(startIdleDetection).toHaveBeenCalled();
  socket.emit('request_authentication');
  expect(socket.sendRegister).toHaveBeenCalledTimes(1);
  socket.emit('register_response', { id: 4, token: 'fixture-token' });
  await tick();
  expect(saveCredentials).toHaveBeenCalledWith({ serverUrl: 'https://workspace.test', id: 4, token: 'fixture-token' });
  expect(socket.sendAuthenticate).toHaveBeenCalledWith(
    expect.objectContaining({ id: 4, token: 'fixture-token', appVersion: '1.0.0' }),
  );
  socket.emit('authenticated', { deviceId: 4, resources: [], locked: true });
  expect(showKioskOverlay).toHaveBeenCalledTimes(1);
  socket.emit('authenticated', { deviceId: 4, resources: [], locked: false });
  expect(hideKioskOverlay).toHaveBeenCalledTimes(1);
  state.adminOverride = true;
  socket.emit('authenticated', { deviceId: 4, resources: [], locked: true });
  expect(showKioskOverlay).toHaveBeenCalledTimes(1);
  expect(state.serverLocked).toBe(true);
  socket.emit('disconnected');
  expect(state.wsConnected).toBe(false);
});
it.each([
  { version: '../escape', downloadUrl: '/update.bin', sha256: 'fixture' },
  { version: '1.2.3', downloadUrl: 'https://other.test/update.bin', sha256: 'fixture' },
])('rejects unsafe update metadata before downloading: $downloadUrl $version', async (payload) => {
  const socket = await register();
  socket.emit('update_available', payload);
  await tick();
  expect(https.get).not.toHaveBeenCalled();
  expect(osAdapter.applyUpdate).not.toHaveBeenCalled();
  expect(state.updateInProgress).toBe(false);
});
it.each([undefined, 'incorrect'])('refuses an update with a missing or mismatched checksum: %s', async (sha256) => {
  const socket = await register();
  socket.emit('update_available', { version: '1.2.3', downloadUrl: '/update.bin', sha256 });
  await tick();
  await tick();
  expect(osAdapter.applyUpdate).not.toHaveBeenCalled();
  expect(fs.unlink).toHaveBeenCalledWith(
    expect.stringMatching(/^\/fixture-temp\/attraccess-companion-update-1\.2\.3-.*\.bin$/),
    expect.any(Function),
  );
  expect(state.updateInProgress).toBe(false);
});
it('applies a verified same-origin update once and permits the adapter to quit', async () => {
  const socket = await register();
  const sha256 = createHash('sha256').update('fixture-update').digest('hex');
  jest.mocked(osAdapter.applyUpdate).mockImplementation(async (_dest, _version, allowQuit) => allowQuit());
  const update = { version: '1.2.3', downloadUrl: 'https://workspace.test/update.bin', sha256 };
  socket.emit('update_available', update);
  socket.emit('update_available', update);
  await tick();
  await tick();
  expect(osAdapter.applyUpdate).toHaveBeenCalledTimes(1);
  expect(osAdapter.applyUpdate).toHaveBeenCalledWith(
    expect.stringContaining('/fixture-temp/attraccess-companion-update-1.2.3-'),
    '1.2.3',
    expect.any(Function),
  );
  expect(state.allowQuit).toBe(true);
  expect(state.updateInProgress).toBe(false);
});
it('blocks quitting a locked kiosk and requires a PIN otherwise', () => {
  const event = { preventDefault: jest.fn() };
  state.kioskLocked = true;
  lifecycle.get('before-quit')?.(event);
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(openWizardWindow).not.toHaveBeenCalled();
  state.kioskLocked = false;
  state.pinHash = 'fixture';
  lifecycle.get('before-quit')?.(event);
  expect(openWizardWindow).toHaveBeenCalledWith({ requirePin: 'quit' });
  state.allowQuit = true;
  lifecycle.get('before-quit')?.(event);
  expect(hideKioskOverlay).toHaveBeenCalled();
  expect(state.allowQuit).toBe(false);
});
