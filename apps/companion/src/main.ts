import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, session, screen, dialog, globalShortcut } from 'electron';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { createHash } from 'crypto';
import { CompanionWsClient, CompanionAuthenticatedDto, CompanionRegisterResponseDto } from '@attraccess/companion-ws-client';
import { loadCredentials, saveCredentials, StoredCredentials, loadPin, savePin } from './keychain';
import { normalizeServerUrl } from './server-url';
import { dotIconPng } from './tray-icon';
import { attraccessLogoSvg } from './logo-svg';
import {
  hasAccessibilityPermission,
  promptAccessibilityPermission,
  installLaunchAgent,
} from './macos-lock';

// ─── State ───────────────────────────────────────────────────────────────────

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let kioskWindow: BrowserWindow | null = null;
let wsClient: CompanionWsClient | null = null;
let creds: StoredCredentials | null = null;
let autoLogoffSeconds = 30;
let authenticatedPayload: CompanionAuthenticatedDto | null = null;
let pinHash: string | null = null;
let allowQuit = false;
let kioskLocked = false;

// ponytail: increment per new kiosk window so each open gets a fresh web session (sign-out on close)
let _kioskSessionId = 0;

// dark blanks that cover secondary displays while the kiosk is locked
let secondaryOverlays: BrowserWindow[] = [];

// ─── PIN helpers ──────────────────────────────────────────────────────────────

function hashPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex');
}

function isPinSet(): boolean {
  return !!pinHash;
}

function verifyPin(input: string): boolean {
  if (!pinHash) return false;
  return hashPin(input) === pinHash;
}

// ─── Health check ─────────────────────────────────────────────────────────────

function checkHealth(serverUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL('/api/info', serverUrl);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.get(url.toString(), (res) => {
      resolve(res.statusCode !== undefined && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
  });
}

// ─── Kiosk webview URL selection ──────────────────────────────────────────────

function kioskUrl(payload: CompanionAuthenticatedDto): string {
  const base = creds?.serverUrl ?? '';
  const timeout = `autoLogoff=${autoLogoffSeconds}`;
  if (payload.resources.length === 1) {
    return `${base}/kiosk/resources/${payload.resources[0].id}?${timeout}`;
  }
  return `${base}/kiosk/companion?deviceId=${payload.deviceId}&${timeout}`;
}

// ─── Kiosk window ────────────────────────────────────────────────────────────

function openKiosk(payload: CompanionAuthenticatedDto) {
  if (kioskWindow && !kioskWindow.isDestroyed()) {
    kioskWindow.loadURL(kioskUrl(payload));
    return;
  }

  const ses = session.fromPartition(`memory:kiosk-${++_kioskSessionId}`, { cache: false });

  kioskWindow = new BrowserWindow({
    show: false,
    frame: true,
    webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true },
  });

  kioskWindow.loadURL(kioskUrl(payload));
  kioskWindow.on('close', (event) => {
    if (kioskLocked) event.preventDefault();
  });
  kioskWindow.on('closed', () => { kioskWindow = null; });
}

function reloadKiosk() {
  if (kioskWindow && !kioskWindow.isDestroyed()) {
    kioskWindow.loadURL('about:blank').then(() => {
      if (authenticatedPayload) kioskWindow?.loadURL(kioskUrl(authenticatedPayload));
    });
  }
}

// open the resource panel from the tray — windowed, not blocking
function reopenKiosk() {
  if (!authenticatedPayload) return;
  openKiosk(authenticatedPayload);
  const win = kioskWindow;
  if (!win || win.isDestroyed()) return;
  kioskLocked = false;
  win.setAlwaysOnTop(false);
  if (process.platform === 'darwin') win.setKiosk(false);
  else win.setFullScreen(false);
  win.setResizable(true);
  win.setSize(960, 720);
  win.center();
  win.show();
  win.focus();
}

// ─── Lock / unlock ────────────────────────────────────────────────────────────

// Keyboard escapes swallowed while locked. Process switching (Cmd+Tab, Mission
// Control, Spaces), force-quit and app-hide are blocked by the kiosk
// presentation options that setKiosk(true) engages, so this list only covers
// the gaps those options leave.
const LOCK_SHORTCUTS = [
  'CommandOrControl+Q',
  'CommandOrControl+W',
  'CommandOrControl+M',
  'CommandOrControl+H',
  'CommandOrControl+Space',     // Spotlight
  'CommandOrControl+Alt+Space', // Spotlight (alt)
  'CommandOrControl+`',         // cycle app windows
];

function registerLockShortcuts(): void {
  for (const accel of LOCK_SHORTCUTS) {
    // ponytail: some accels are OS-reserved and throw; swallowing the rest is enough
    try { globalShortcut.register(accel, () => undefined); } catch { /* reserved */ }
  }
}

function addSecondaryOverlay(x: number, y: number, width: number, height: number): void {
  const overlay = new BrowserWindow({
    x, y, width, height,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0f172a',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  // Must use the SAME fullscreen mode as the main window. Presentation options
  // are app-global and last-write-wins; mixing kiosk + simpleFullScreen lets the
  // looser simpleFullScreen options clobber kiosk's disableProcessSwitching,
  // re-enabling Space swiping. Uniform kiosk = identical options = no clobber,
  // and it covers the display's menu bar.
  if (process.platform === 'darwin') overlay.setKiosk(true);
  else overlay.setFullScreen(true);
  // Centered, dimmed "Locked by" + Attraccess lockup on the dark blocker. color: drives the wordmark.
  const blockerHtml =
    `<!doctype html><html><body style="margin:0;height:100vh;display:flex;flex-direction:column;` +
    `align-items:center;justify-content:center;gap:1.25rem;background:#0f172a;color:#cbd5e1;opacity:.55">` +
    `<span style="font:500 14px/1 system-ui,sans-serif;letter-spacing:.06em">Locked by</span>` +
    `<div style="width:38vw;max-width:520px">${attraccessLogoSvg}</div></body></html>`;
  overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(blockerHtml));
  overlay.on('closed', () => { secondaryOverlays = secondaryOverlays.filter(w => w !== overlay); });
  secondaryOverlays.push(overlay);
}

function showKioskOverlay(): void {
  const win = kioskWindow;
  if (!win || win.isDestroyed()) return;

  kioskLocked = true;
  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') {
    // Kiosk mode engages NSApplicationPresentationOptions: hides the menu bar,
    // disables process switching (Cmd+Tab / Mission Control / Spaces), force
    // quit, session termination and app hide — the things setSimpleFullScreen
    // left open.
    win.setKiosk(true);
  } else {
    win.setFullScreen(true);
  }
  win.show();
  registerLockShortcuts();

  // cover any other displays with dark blanks
  const kioskBounds = win.getBounds();
  for (const display of screen.getAllDisplays()) {
    const { x, y, width, height } = display.bounds;
    // skip the display already covered by the kiosk window
    if (x === kioskBounds.x && y === kioskBounds.y) continue;
    addSecondaryOverlay(x, y, width, height);
  }

  // focus last — the secondary kiosk windows can grab focus as they're created
  win.focus();
}

function hideKioskOverlay(): void {
  kioskLocked = false;
  globalShortcut.unregisterAll();

  // Order matters. setKiosk(false) restores the presentation options that were
  // current when THAT window entered kiosk, and the LAST call wins (options are
  // app-global). The main window saved the pre-lock (default) options; each
  // secondary saved the already-strict options. So the secondaries must exit
  // kiosk FIRST and the main window LAST — otherwise a secondary's restore
  // re-applies the strict no-process-switching options and they stick after
  // unlock (swipe-to-Space stays blocked).
  for (const w of secondaryOverlays) {
    if (w.isDestroyed()) continue;
    const kill = () => { if (!w.isDestroyed()) w.destroy(); };
    if (process.platform === 'darwin' && w.isKiosk()) {
      w.once('leave-full-screen', kill);
      w.setKiosk(false);
      setTimeout(kill, 1000);
    } else {
      kill();
    }
  }
  secondaryOverlays = [];

  const win = kioskWindow;
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(false);
    if (process.platform === 'darwin' && win.isKiosk()) {
      // Exiting kiosk is an async native-fullscreen transition; hiding mid-flight
      // is ignored and leaves a black frame. Hide once the transition lands
      // (with a fallback in case the event is missed).
      const doHide = () => { if (!win.isDestroyed()) win.hide(); };
      win.once('leave-full-screen', doHide);
      win.setKiosk(false);
      setTimeout(doHide, 1000);
    } else {
      if (process.platform !== 'darwin') win.setFullScreen(false);
      win.hide();
    }
  }
}

function lockComputer(): void {
  // Server-controlled lock: the kiosk overlay is the lock (the OS login screen
  // can't be dismissed by an unlock_pc message, so it's not usable here).
  showKioskOverlay();
}

function unlockComputer(): void {
  hideKioskOverlay();
}

// ─── Tray ────────────────────────────────────────────────────────────────────

type TrayState = 'locked' | 'unlocked' | 'disconnected';

const TRAY_COLORS: Record<TrayState, [number, number, number]> = {
  unlocked: [34, 197, 94],       // green
  locked: [239, 68, 68],         // red
  disconnected: [148, 163, 184], // gray
};

function dotIcon(color: [number, number, number]): Electron.NativeImage {
  return nativeImage.createFromBuffer(dotIconPng(color));
}

function buildTrayMenu(state: TrayState): Menu {
  return Menu.buildFromTemplate([
    ...(state === 'unlocked'
      ? [{ type: 'separator' as const }]
      : [
          { label: state === 'disconnected' ? 'Connecting…' : 'No active session', enabled: false },
          { type: 'separator' as const },
        ]),
    { label: 'Open resource panel', enabled: !!authenticatedPayload, click: () => reopenKiosk() },
    { label: 'Settings', click: () => {
      if (isPinSet()) {
        openWizardWindow({ requirePin: 'settings' });
      } else {
        openWizardWindow({ firstRun: false });
      }
    }},
    { label: 'About', click: () => {
      void dialog.showMessageBox({ title: 'Attraccess Companion', message: `Attraccess Companion\nVersion ${app.getVersion()}` });
    }},
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function setupTray() {
  tray = new Tray(dotIcon(TRAY_COLORS.disconnected));
  setTrayState('disconnected');
}

function setTrayState(state: TrayState) {
  tray?.setImage(dotIcon(TRAY_COLORS[state]));
  tray?.setContextMenu(buildTrayMenu(state));
  const resourceName = authenticatedPayload?.resources[0]?.name;
  const tooltip = resourceName
    ? `Attraccess Companion — ${resourceName} (${state})`
    : `Attraccess Companion — ${state}`;
  tray?.setToolTip(tooltip);
}

// ─── Wizard window ────────────────────────────────────────────────────────────

interface WizardOpts {
  firstRun?: boolean;
  requirePin?: 'settings' | 'quit';
}

function openWizardWindow(opts: WizardOpts = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (opts.requirePin) {
      // Close existing window and reopen as PIN dialog
      mainWindow.destroy();
    } else {
      mainWindow.focus();
      return;
    }
  }

  mainWindow = new BrowserWindow({
    width: 520,
    height: 460,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // dev: load the Vite HMR server; prod: __dirname is out/, renderer/dist/ has the build
  const devUrl = process.env.COMPANION_DEV_RENDERER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
  }
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('init', {
      firstRun: opts.firstRun ?? false,
      serverUrl: creds?.serverUrl,
      requirePin: opts.requirePin,
    });
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

function permissionsSnapshot() {
  return {
    needed: process.platform === 'darwin',
    accessibility: hasAccessibilityPermission(),
  };
}

function allPermissionsGranted() {
  return !permissionsSnapshot().needed || permissionsSnapshot().accessibility;
}

ipcMain.handle('get-permissions', () => permissionsSnapshot());

ipcMain.handle('request-permission', (_evt, name: string) => {
  if (name === 'accessibility') promptAccessibilityPermission();
  return permissionsSnapshot();
});

ipcMain.handle('is-pin-set', () => isPinSet());

ipcMain.handle('save-pin', async (_evt, pin: string) => {
  const hash = hashPin(pin);
  await savePin(hash);
  pinHash = hash;
});

ipcMain.handle('verify-pin', (_evt, pin: string) => verifyPin(pin));

ipcMain.handle('confirm-quit', () => {
  allowQuit = true;
  app.quit();
});

ipcMain.handle('check-health', async (_evt, serverUrl: string) => {
  return checkHealth(normalizeServerUrl(serverUrl));
});

ipcMain.handle('register', async (_evt, serverUrl: string) => {
  if (!allPermissionsGranted()) {
    throw new Error('accessibility-permission-required');
  }
  const url = normalizeServerUrl(serverUrl);
  creds = { serverUrl: url, id: 0, token: '' };
  startWsClient(url, /* firstRun */ true);
  return true;
});

ipcMain.handle('set-auto-logoff', (_evt, seconds: number) => {
  autoLogoffSeconds = seconds;
});


// ─── WebSocket wiring ─────────────────────────────────────────────────────────

function startWsClient(serverUrl: string, firstRun: boolean) {
  wsClient?.stop();
  wsClient = new CompanionWsClient(serverUrl);

  wsClient.on('connected', () => {
    setTrayState('unlocked');
    mainWindow?.webContents.send('ws-status', 'connected');
  });

  wsClient.on('disconnected', () => {
    setTrayState('disconnected');
    mainWindow?.webContents.send('ws-status', 'disconnected');
  });

  wsClient.on('request_authentication', () => {
    if (firstRun || !creds?.id) {
      wsClient?.sendRegister();
    } else {
      wsClient?.sendAuthenticate({ id: creds.id, token: creds.token });
    }
  });

  wsClient.on('register_response', async (payload: CompanionRegisterResponseDto) => {
    const url = creds?.serverUrl ?? '';
    creds = { serverUrl: url, id: payload.id, token: payload.token };
    await saveCredentials(creds);
    firstRun = false;
    mainWindow?.webContents.send('registered', { id: payload.id });
    // server only sends AUTHENTICATED in reply to AUTHENTICATE; register alone
    // never authenticates, so do it now instead of waiting for a relaunch
    wsClient?.sendAuthenticate({ id: payload.id, token: payload.token });

    // install launchd user agent on first registration so the companion
    // starts automatically on login (macOS only — no-op on other platforms)
    installLaunchAgent(app.getPath('exe')).catch(() => {
      // non-fatal — app may not be packaged yet in dev
    });
  });

  wsClient.on('authenticated', async (payload: CompanionAuthenticatedDto) => {
    authenticatedPayload = payload;
    mainWindow?.webContents.send('authenticated', payload);
    openKiosk(payload);
    // restore persisted lock state so a restart doesn't silently unlock
    setTrayState(payload.locked ? 'locked' : 'unlocked');
    if (payload.locked) {
      showKioskOverlay();
    } else {
      hideKioskOverlay();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => mainWindow?.close(), 1500);
    }
  });

  wsClient.on('lock_pc', () => {
    setTrayState('locked');
    reloadKiosk();
    lockComputer();
  });

  wsClient.on('unlock_pc', () => {
    setTrayState('unlocked');
    unlockComputer();
  });

  wsClient.on('update_available', (payload) => {
    // ponytail: tray tooltip for now; full OTA download+relaunch in ATT-623
    tray?.setToolTip(`Update available: ${payload.version}`);
  });

  wsClient.connect();
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  setupTray();

  [creds, pinHash] = await Promise.all([loadCredentials(), loadPin()]);

  if (!creds?.serverUrl || !creds?.id) {
    openWizardWindow({ firstRun: true });
  } else if (!allPermissionsGranted()) {
    // Permissions were revoked since last launch — open wizard to re-grant
    openWizardWindow({ firstRun: false });
  } else {
    startWsClient(creds.serverUrl, /* firstRun */ false);
  }
});

app.on('window-all-closed', () => {
  // keep running in tray
});

app.on('before-quit', (event) => {
  // A locked machine must never be quittable — not even with a PIN. It unlocks
  // only when the server says so.
  if (kioskLocked && !allowQuit) {
    event.preventDefault();
    return;
  }
  if (pinHash && !allowQuit) {
    event.preventDefault();
    openWizardWindow({ requirePin: 'quit' });
    return;
  }
  allowQuit = false;
  hideKioskOverlay();
  wsClient?.stop();
});

export {};
