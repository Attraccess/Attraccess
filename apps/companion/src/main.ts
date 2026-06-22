import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, session } from 'electron';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { CompanionWsClient, AuthenticatedPayload, RegisterResponsePayload } from './ws-client';
import { loadCredentials, saveCredentials, StoredCredentials } from './keychain';

// ─── State ───────────────────────────────────────────────────────────────────

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let kioskWindow: BrowserWindow | null = null;
let wsClient: CompanionWsClient | null = null;
let creds: StoredCredentials | null = null;
let autoLogoffSeconds = 300;
let authenticatedPayload: AuthenticatedPayload | null = null;

// ponytail: random uuid-ish partition key so the session is always fresh per launch
const KIOSK_PARTITION = `memory:${Math.random().toString(36).slice(2)}`;

// ─── Health check ─────────────────────────────────────────────────────────────

function checkHealth(serverUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL('/api/health', serverUrl);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.get(url.toString(), (res) => {
      resolve(res.statusCode !== undefined && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
  });
}

// ─── Kiosk webview URL selection ──────────────────────────────────────────────

function kioskUrl(payload: AuthenticatedPayload): string {
  const base = creds?.serverUrl ?? '';
  const timeout = `autoLogoff=${autoLogoffSeconds}`;
  if (payload.resources.length === 1) {
    return `${base}/kiosk/resources/${payload.resources[0].id}?${timeout}`;
  }
  return `${base}/kiosk/companion?deviceId=${payload.deviceId}&${timeout}`;
}

// ─── Kiosk window ────────────────────────────────────────────────────────────

function openKiosk(payload: AuthenticatedPayload) {
  if (kioskWindow && !kioskWindow.isDestroyed()) {
    kioskWindow.loadURL(kioskUrl(payload));
    return;
  }

  const ses = session.fromPartition(KIOSK_PARTITION, { cache: false });

  kioskWindow = new BrowserWindow({
    fullscreen: true,
    alwaysOnTop: false,
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

function showKioskOverlay() {
  kioskWindow?.setAlwaysOnTop(true, 'screen-saver');
  kioskWindow?.setFullScreen(true);
  kioskWindow?.show();
  kioskWindow?.focus();
}

function hideKioskOverlay() {
  kioskWindow?.setAlwaysOnTop(false);
  reloadKiosk();
}

// ─── Tray ────────────────────────────────────────────────────────────────────

type TrayState = 'locked' | 'unlocked' | 'disconnected';

function buildTrayMenu(state: TrayState): Menu {
  return Menu.buildFromTemplate([
    { label: `Status: ${state}`, enabled: false },
    { type: 'separator' },
    { label: 'Settings', click: () => openWizardWindow(false) },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function setupTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Attraccess Companion');
  setTrayState('disconnected');
}

function setTrayState(state: TrayState) {
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

  // __dirname is out/ at runtime; renderer/ sits next to out/ at the app root
  mainWindow.loadFile(path.join(__dirname, '../renderer/wizard.html'));
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('init', { firstRun, serverUrl: creds?.serverUrl });
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

ipcMain.handle('check-health', async (_evt, serverUrl: string) => {
  return checkHealth(serverUrl);
});

ipcMain.handle('register', async (_evt, serverUrl: string) => {
  creds = { serverUrl, id: 0, token: '' };
  startWsClient(serverUrl, /* firstRun */ true);
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

  wsClient.on('register_response', async (payload: RegisterResponsePayload) => {
    const url = creds?.serverUrl ?? '';
    creds = { serverUrl: url, id: payload.id, token: payload.token };
    await saveCredentials(creds);
    firstRun = false;
    mainWindow?.webContents.send('registered', { id: payload.id });
  });

  wsClient.on('authenticated', async (payload: AuthenticatedPayload) => {
    authenticatedPayload = payload;
    mainWindow?.webContents.send('authenticated', payload);
    openKiosk(payload);
    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => mainWindow?.close(), 1500);
    }
  });

  wsClient.on('lock_pc', () => {
    setTrayState('locked');
    reloadKiosk();
    showKioskOverlay();
  });

  wsClient.on('unlock_pc', () => {
    setTrayState('unlocked');
    hideKioskOverlay();
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
  wsClient?.stop();
});

export {};
