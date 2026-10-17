import { EventEmitter } from 'events';
import { BrowserWindow, globalShortcut, Menu, session } from 'electron';
import { state } from './state';
import { openKiosk, reopenKiosk, showKioskOverlay, hideKioskOverlay, reloadKiosk } from './kiosk';
import { openWizardWindow } from './wizard-window';
import { setupTray, setTrayState } from './tray';
jest.mock('./platform-adapter', () => ({
  osAdapter: { lockShortcuts: () => ['Alt+Tab'], tryOsLock: jest.fn().mockResolvedValue(true), onUnlock: jest.fn() },
}));
jest.mock('electron', () => ({
  BrowserWindow: jest.fn((options) => makeWindow(options)),
  session: { fromPartition: jest.fn().mockReturnValue({ isolated: true }) },
  screen: {
    getAllDisplays: () => [
      { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      { bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
    ],
  },
  globalShortcut: { register: jest.fn(), unregisterAll: jest.fn() },
  Menu: { buildFromTemplate: jest.fn((items) => ({ items, popup: jest.fn() })) },
  Tray: jest.fn(() => ({ setImage: jest.fn(), setContextMenu: jest.fn(), setToolTip: jest.fn() })),
  nativeImage: { createFromBuffer: jest.fn() },
  dialog: { showMessageBox: jest.fn() },
  app: { getVersion: () => '1.0', quit: jest.fn() },
}));
function makeWindow(options: unknown) {
  const win = Object.assign(new EventEmitter(), {
    options,
    destroyed: false,
    kiosk: false,
    webContents: Object.assign(new EventEmitter(), { send: jest.fn() }),
    loadURL: jest.fn().mockResolvedValue(undefined),
    loadFile: jest.fn(),
    focus: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    center: jest.fn(),
    setSize: jest.fn(),
    setResizable: jest.fn(),
    setAlwaysOnTop: jest.fn(),
    setFullScreen: jest.fn(),
    getBounds: () => ({ x: 0, y: 0 }),
    isDestroyed: () => win.destroyed,
    isKiosk: () => win.kiosk,
    setKiosk: jest.fn((value: boolean) => {
      win.kiosk = value;
    }),
    destroy: jest.fn(() => {
      win.destroyed = true;
      win.emit('closed');
    }),
  });
  return win;
}
const windows = () =>
  (BrowserWindow as unknown as jest.Mock<ReturnType<typeof makeWindow>>).mock.results.map((result) => result.value);
const payload = { deviceId: 4, resources: [{ id: 7, name: 'Laser' }] } as NonNullable<
  typeof state.authenticatedPayload
>;
const platform = process.platform;
let devUrl: string | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  devUrl = process.env.COMPANION_DEV_RENDERER_URL;
  delete process.env.COMPANION_DEV_RENDERER_URL;
  Object.assign(state, {
    kioskWindow: null,
    mainWindow: null,
    authenticatedPayload: payload,
    creds: { serverUrl: 'https://workspace.test', id: 4 },
    kioskLocked: false,
    adminOverride: false,
    pinHash: null,
    wsConnected: true,
    onAdminOverrideDisable: null,
  });
});
afterEach(() => {
  hideKioskOverlay();
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  Object.defineProperty(process, 'platform', { value: platform });
  if (devUrl === undefined) delete process.env.COMPANION_DEV_RENDERER_URL;
  else process.env.COMPANION_DEV_RENDERER_URL = devUrl;
});
it.each(['darwin', 'win32', 'linux'])('locks and releases every display safely on %s', (target) => {
  Object.defineProperty(process, 'platform', { value: target });
  openKiosk(payload);
  const main = windows()[0];
  expect(session.fromPartition).toHaveBeenCalledWith(expect.stringMatching(/^memory:kiosk-/), { cache: false });
  expect(main.loadURL).toHaveBeenCalledWith('https://workspace.test/kiosk/resources/7?autoLogoff=30');
  showKioskOverlay();
  const secondary = windows()[1];
  expect(state.kioskLocked).toBe(true);
  expect(globalShortcut.register).toHaveBeenCalledWith('Alt+Tab', expect.any(Function));
  const preventDefault = jest.fn();
  main.emit('close', { preventDefault });
  expect(preventDefault).toHaveBeenCalledTimes(1);
  hideKioskOverlay();
  expect(state.kioskLocked).toBe(false);
  expect(globalShortcut.unregisterAll).toHaveBeenCalled();
  if (target === 'darwin') {
    expect(secondary.setKiosk.mock.invocationCallOrder.at(-1)).toBeLessThan(
      main.setKiosk.mock.invocationCallOrder.at(-1) ?? 0,
    );
    expect(main.hide).not.toHaveBeenCalled();
    secondary.emit('leave-full-screen');
    main.emit('leave-full-screen');
  }
  expect(secondary.destroy).toHaveBeenCalledTimes(1);
  expect(main.hide).toHaveBeenCalledTimes(1);
});
it('reuses the resource window, reloads via a blank page and reopens it unlocked', async () => {
  openKiosk(payload);
  const main = windows()[0];
  openKiosk({ ...payload, resources: [] });
  expect(windows()).toHaveLength(1);
  expect(main.loadURL).toHaveBeenLastCalledWith('https://workspace.test/kiosk/companion?deviceId=4&autoLogoff=30');
  reloadKiosk();
  await Promise.resolve();
  expect(main.loadURL).toHaveBeenLastCalledWith('https://workspace.test/kiosk/resources/7?autoLogoff=30');
  state.kioskLocked = true;
  reopenKiosk();
  expect(state.kioskLocked).toBe(false);
  expect(main.setSize).toHaveBeenCalledWith(960, 720);
  expect(main.focus).toHaveBeenCalled();
  state.authenticatedPayload = null;
  reopenKiosk();
  expect(windows()).toHaveLength(1);
});
it('reuses settings windows but recreates an elevated PIN dialog with isolated web preferences', () => {
  openWizardWindow();
  const first = windows()[0];
  expect(first.options).toMatchObject({
    webPreferences: { nodeIntegration: false, contextIsolation: true, devTools: false },
  });
  expect(first.loadFile).toHaveBeenCalledWith(expect.stringContaining('renderer/dist/index.html'));
  openWizardWindow();
  expect(first.focus).toHaveBeenCalledTimes(1);
  process.env.COMPANION_DEV_RENDERER_URL = 'http://localhost:4999';
  openWizardWindow({ requirePin: 'admin-override' });
  const pin = windows()[1];
  expect(first.destroy).toHaveBeenCalledTimes(1);
  expect(pin.loadURL).toHaveBeenCalledWith('http://localhost:4999');
  expect(pin.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
  pin.webContents.emit('did-finish-load');
  expect(pin.webContents.send).toHaveBeenCalledWith('init', {
    serverUrl: 'https://workspace.test',
    requirePin: 'admin-override',
    registered: true,
    connected: true,
  });
  pin.destroy();
  expect(state.mainWindow).toBeNull();
});
it('updates tray state and gates settings behind the configured PIN', () => {
  setupTray();
  state.adminOverride = true;
  state.pinHash = 'fixture-hash';
  state.onAdminOverrideDisable = jest.fn();
  setTrayState('locked');
  const items = jest.mocked(Menu.buildFromTemplate).mock.calls.at(-1)?.[0] ?? [];
  const settings = items.find((item) => item.label === 'Settings');
  // Electron passes MenuItem, BrowserWindow and event; the registered callback ignores all three.
  (settings?.click as () => void)();
  expect(windows()).toHaveLength(1);
  windows()[0].webContents.emit('did-finish-load');
  expect(windows()[0].webContents.send).toHaveBeenCalledWith(
    'init',
    expect.objectContaining({ requirePin: 'settings' }),
  );
  (items.find((item) => item.label === 'Disable Admin Override')?.click as () => void)();
  expect(state.onAdminOverrideDisable).toHaveBeenCalledTimes(1);
  expect(state.tray?.setToolTip).toHaveBeenCalledWith('Attraccess Companion — Laser (locked) — override active');
});
