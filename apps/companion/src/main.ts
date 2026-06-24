import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, session, screen, dialog } from 'electron';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { createHash } from 'crypto';
import { CompanionWsClient, CompanionAuthenticatedDto, CompanionRegisterResponseDto } from '@attraccess/companion-ws-client';
import { loadCredentials, saveCredentials, StoredCredentials, loadPin, savePin } from './keychain';
import { normalizeServerUrl } from './server-url';
import { dotIconPng } from './tray-icon';
import {
  lockViaCGSession,
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

// ponytail: random uuid-ish partition key so the session is always fresh per launch
const KIOSK_PARTITION = `memory:${Math.random().toString(36).slice(2)}`;

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

  const ses = session.fromPartition(KIOSK_PARTITION, { cache: false });

  kioskWindow = new BrowserWindow({
    show: false,
    frame: true,
    webPreferences: {
      session: ses,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'kiosk-preload.js'),
    },
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
  if (process.platform === 'darwin') win.setSimpleFullScreen(false);
  else win.setFullScreen(false);
  win.setResizable(true);
  win.setSize(960, 720);
  win.center();
  win.show();
  win.focus();
}

// ─── Lock / unlock ────────────────────────────────────────────────────────────

function addSecondaryOverlay(x: number, y: number, width: number, height: number): void {
  const overlay = new BrowserWindow({
    x, y, width, height,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    backgroundColor: '#0f172a',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.loadURL('about:blank');
  overlay.on('closed', () => { secondaryOverlays = secondaryOverlays.filter(w => w !== overlay); });
  secondaryOverlays.push(overlay);
}

function showKioskOverlay(): void {
  const win = kioskWindow;
  if (!win || win.isDestroyed()) return;

  kioskLocked = true;
  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') win.setSimpleFullScreen(true);
  else win.setFullScreen(true);
  win.show();
  win.focus();

  // cover any other displays with dark blanks
  const kioskBounds = win.getBounds();
  for (const display of screen.getAllDisplays()) {
    const { x, y, width, height } = display.bounds;
    // skip the display already covered by the kiosk window
    if (x === kioskBounds.x && y === kioskBounds.y) continue;
    addSecondaryOverlay(x, y, width, height);
  }
}

function hideKioskOverlay(): void {
  kioskLocked = false;
  const win = kioskWindow;
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(false);
    if (process.platform === 'darwin') win.setSimpleFullScreen(false);
    else win.setFullScreen(false);
    win.hide();
  }
  for (const w of secondaryOverlays) {
    if (!w.isDestroyed()) w.destroy();
  }
  secondaryOverlays = [];
}

async function lockComputer(): Promise<void> {
  // macOS primary: CGSession -suspend triggers the OS login screen.
  // Belt-and-suspenders: also show the kiosk overlay so the machine is
  // covered when the user returns before unlock_pc arrives.
  await lockViaCGSession();
  showKioskOverlay();
}

function unlockComputer(): void {
  hideKioskOverlay();
}

// ─── Tray ────────────────────────────────────────────────────────────────────

type TrayState = 'locked' | 'unlocked' | 'idle_lock' | 'disconnected';

const TRAY_COLORS: Record<TrayState, [number, number, number]> = {
  unlocked: [34, 197, 94],   // green
  locked: [239, 68, 68],     // red
  idle_lock: [245, 158, 11], // orange
  disconnected: [148, 163, 184], // gray
};

function dotIcon(color: [number, number, number]): Electron.NativeImage {
  return nativeImage.createFromBuffer(dotIconPng(color));
}

function buildTrayMenu(state: TrayState): Menu {
  const sessionActive = state === 'unlocked' || state === 'idle_lock';
  return Menu.buildFromTemplate([
    ...(sessionActive
      ? [
          ...(state === 'idle_lock'
            ? [{ label: 'Dismiss idle lock', click: () => dismissIdleLock() }]
            : []),
          { type: 'separator' as const },
        ]
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

let currentTrayState: TrayState = 'disconnected';

function setupTray() {
  tray = new Tray(dotIcon(TRAY_COLORS.disconnected));
  setTrayState('disconnected');
}

function setTrayState(state: TrayState) {
  currentTrayState = state;
  tray?.setImage(dotIcon(TRAY_COLORS[state]));
  tray?.setContextMenu(buildTrayMenu(state));
  const resourceName = authenticatedPayload?.resources[0]?.name;
  const tooltip = resourceName
    ? `Attraccess Companion — ${resourceName} (${state})`
    : `Attraccess Companion — ${state}`;
  tray?.setToolTip(tooltip);
}

// ─── Session management ───────────────────────────────────────────────────────

function dismissIdleLock(): void {
  setTrayState('unlocked');
  kioskWindow?.webContents.send('kiosk-dismiss-idle');
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

ipcMain.on('kiosk-idle-warning', (_evt, isWarning: boolean) => {
  if (isWarning) {
    setTrayState('idle_lock');
  } else if (currentTrayState === 'idle_lock') {
    setTrayState('unlocked');
  }
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

  wsClient.on('lock_pc', async () => {
    setTrayState('locked');
    reloadKiosk();
    await lockComputer();
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
