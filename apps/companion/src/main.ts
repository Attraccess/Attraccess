import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, session, screen } from 'electron';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { CompanionWsClient, CompanionAuthenticatedDto, CompanionRegisterResponseDto } from '@attraccess/companion-ws-client';
import { loadCredentials, saveCredentials, StoredCredentials } from './keychain';
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

// ponytail: random uuid-ish partition key so the session is always fresh per launch
const KIOSK_PARTITION = `memory:${Math.random().toString(36).slice(2)}`;

// dark blanks that cover secondary displays while the kiosk is locked
let secondaryOverlays: BrowserWindow[] = [];

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
    frame: false,
    webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true },
  });

  kioskWindow.loadURL(kioskUrl(payload));
  kioskWindow.on('closed', () => { kioskWindow = null; });
}

function reloadKiosk() {
  if (kioskWindow && !kioskWindow.isDestroyed()) {
    kioskWindow.loadURL('about:blank').then(() => {
      if (authenticatedPayload) kioskWindow?.loadURL(kioskUrl(authenticatedPayload));
    });
  }
}

// reopen/show the kiosk from the tray (recreates the window if it was closed)
function reopenKiosk() {
  if (!authenticatedPayload) return;
  openKiosk(authenticatedPayload);
  const win = kioskWindow;
  if (win) {
    win.setSimpleFullScreen(true);
    win.show();
    win.focus();
  }
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

  // bring kiosk to front, fullscreen, always-on-top
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

type TrayState = 'locked' | 'unlocked' | 'disconnected';

const TRAY_COLORS: Record<TrayState, [number, number, number]> = {
  unlocked: [34, 197, 94], // green
  locked: [239, 68, 68], // red
  disconnected: [148, 163, 184], // gray
};

function dotIcon(color: [number, number, number]): Electron.NativeImage {
  return nativeImage.createFromBuffer(dotIconPng(color));
}

function buildTrayMenu(state: TrayState): Menu {
  return Menu.buildFromTemplate([
    { label: `Status: ${state}`, enabled: false },
    { type: 'separator' },
    { label: 'Open kiosk', enabled: !!authenticatedPayload, click: () => reopenKiosk() },
    { label: 'Settings', click: () => openWizardWindow(false) },
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
  tray?.setToolTip(`Attraccess Companion — ${state}`);
}

// ─── Wizard window ────────────────────────────────────────────────────────────

function openWizardWindow(firstRun: boolean) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 520,
    height: 420,
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
    mainWindow?.webContents.send('init', { firstRun, serverUrl: creds?.serverUrl });
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

ipcMain.handle('check-health', async (_evt, serverUrl: string) => {
  return checkHealth(normalizeServerUrl(serverUrl));
});

ipcMain.handle('register', async (_evt, serverUrl: string) => {
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

  // macOS: prompt for Accessibility permission so the overlay can fully block
  // keyboard and mouse input. Prompt on first launch; the user can grant it in
  // System Settings → Privacy & Security → Accessibility.
  if (!hasAccessibilityPermission()) {
    promptAccessibilityPermission();
  }

  creds = await loadCredentials();
  if (!creds?.serverUrl || !creds?.id) {
    openWizardWindow(/* firstRun */ true);
  } else {
    startWsClient(creds.serverUrl, /* firstRun */ false);
  }
});

app.on('window-all-closed', () => {
  // keep running in tray
});

app.on('before-quit', () => {
  hideKioskOverlay();
  wsClient?.stop();
});

export {};
