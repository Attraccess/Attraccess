import { app, ipcMain } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomBytes } from 'crypto';
import { hashPin, verifyPinHash } from './pin';
import { CompanionWsClient, CompanionAuthenticatedDto, CompanionRegisterResponseDto } from '@attraccess/companion-ws-client';
import { loadCredentials, saveCredentials, clearCredentials, loadPin, savePin } from './keychain';
import { normalizeServerUrl } from './server-url';
import { osAdapter } from './platform-adapter';
import { state } from './state';
import { loadSettings, saveSettings, SETTINGS_DEFAULTS, CompanionSettings } from './settings';
import { startIdleDetection, stopIdleDetection } from './idle-detection';
import { startForegroundAppMonitoring, stopForegroundAppMonitoring } from './foreground-app';
import { openKiosk, reloadKiosk, lockComputer, unlockComputer, showKioskOverlay, hideKioskOverlay } from './kiosk';
import { setupTray, setTrayState } from './tray';
import { openWizardWindow } from './wizard-window';
import {
  enableAdminOverride as _enableAdminOverride,
  disableAdminOverride as _disableAdminOverride,
  handleLockPc,
  handleUnlockPc,
} from './admin-override';

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

// ─── PIN rate limiting ────────────────────────────────────────────────────────
// ponytail: simple exponential backoff; resets on success. Doubles up to 30s.

let _pinFailures = 0;
let _pinBackoffUntil = 0;

function pinAllowed(): boolean {
  return Date.now() >= _pinBackoffUntil;
}

function recordPinFailure(): void {
  _pinFailures++;
  const backoffMs = Math.min(1000 * 2 ** (_pinFailures - 1), 30_000);
  _pinBackoffUntil = Date.now() + backoffMs;
}

function recordPinSuccess(): void {
  _pinFailures = 0;
  _pinBackoffUntil = 0;
}

// ─── Admin override ───────────────────────────────────────────────────────────

function enableAdminOverride(): void {
  _enableAdminOverride(unlockComputer, setTrayState);
}

function disableAdminOverride(): void {
  _disableAdminOverride(lockComputer, setTrayState, reloadKiosk);
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

ipcMain.handle('get-permissions', () => osAdapter.permissionsStatus());

ipcMain.handle('request-permission', (_evt, name: string) => {
  if (name === 'accessibility') osAdapter.requestPermissions();
  return osAdapter.permissionsStatus();
});

ipcMain.handle('is-pin-set', () => !!state.pinHash);

ipcMain.handle('save-pin', async (_evt, pin: string) => {
  const hash = hashPin(pin);
  await savePin(hash);
  state.pinHash = hash;
  // An already-registered device that just set its first PIN can now connect
  // and close the wizard. First-run devices have no creds yet and instead reach
  // the connect step via the URL screen; changing a PIN re-uses an already-
  // running client. Both are covered by the creds.id && !wsClient guard.
  if (state.creds?.id && !state.wsClient) {
    startWsClient(state.creds.serverUrl, false);
    state.mainWindow?.close();
  }
});

ipcMain.handle('verify-pin', (_evt, pin: string) => {
  if (!pinAllowed()) return false;
  const ok = verifyPinHash(pin, state.pinHash);
  if (ok) recordPinSuccess(); else recordPinFailure();
  return ok;
});

ipcMain.handle('enable-admin-override', (_evt, pin: string) => {
  if (!pinAllowed()) return false;
  if (!verifyPinHash(pin, state.pinHash)) { recordPinFailure(); return false; }
  recordPinSuccess();
  enableAdminOverride();
  state.mainWindow?.close();
  return true;
});

ipcMain.handle('confirm-quit', () => {
  state.allowQuit = true;
  app.quit();
});

// Actively forget this device's registration. Only way to drop a registration —
// otherwise a device keeps the same id forever. Clears creds, stops the client
// and tears down any session so the wizard returns to a clean first-run state.
ipcMain.handle('disconnect', async () => {
  state.wsClient?.stop();
  state.wsClient = null;
  state.wsConnected = false;
  state.authenticatedPayload = null;
  state.kioskLocked = false;
  state.adminOverride = false;
  state.serverLocked = false;
  if (state.kioskWindow && !state.kioskWindow.isDestroyed()) state.kioskWindow.destroy();
  await clearCredentials();
  state.creds = null;
  setTrayState('disconnected');
});

ipcMain.handle('check-health', async (_evt, serverUrl: string) => {
  return checkHealth(normalizeServerUrl(serverUrl));
});

ipcMain.handle('register', async (_evt, serverUrl: string) => {
  const { needed, accessibility } = osAdapter.permissionsStatus();
  if (needed && !accessibility) throw new Error('accessibility-permission-required');
  const url = normalizeServerUrl(serverUrl);
  state.creds = { serverUrl: url, id: 0, token: '' };
  startWsClient(url, true);
  return true;
});

ipcMain.handle('set-auto-logoff', (_evt, seconds: number) => {
  state.autoLogoffSeconds = seconds;
});

ipcMain.handle('get-settings', () => state.settings);

ipcMain.handle('save-settings', (_evt, newSettings: CompanionSettings) => {
  state.settings = { ...SETTINGS_DEFAULTS, ...newSettings };
  saveSettings(state.settings);
  if (state.wsClient) {
    startIdleDetection();
    stopForegroundAppMonitoring();
    startForegroundAppMonitoring();
  }
});

// ─── Auto-update ──────────────────────────────────────────────────────────────

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const file = fs.createWriteStream(dest);
    const req = mod.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => undefined);
        return reject(new Error(`Download failed: HTTP ${res.statusCode ?? 'unknown'}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    });
    req.on('error', (err) => { file.close(); fs.unlink(dest, () => undefined); reject(err); });
    req.setTimeout(120000, () => { req.destroy(); file.close(); fs.unlink(dest, () => undefined); reject(new Error('Download timed out')); });
  });
}

function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

async function applyUpdate(serverUrl: string, downloadUrl: string, version: string, sha256?: string): Promise<void> {
  // Validate server-supplied version before using it in a filesystem path to prevent
  // path traversal (e.g. version="../../../../etc/evil" escaping os.tmpdir()).
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`[companion] refusing update with invalid version string: ${JSON.stringify(version)}`);
    return;
  }
  const absUrl = downloadUrl.startsWith('http') ? downloadUrl : `${serverUrl}${downloadUrl}`;
  // Reject downloads from a different origin than the configured server.
  // The server always sends relative paths today, but defend against a future
  // server bug or compromise that returns a redirect to a third-party host.
  if (downloadUrl.startsWith('http')) {
    try {
      const expectedOrigin = new URL(serverUrl).origin;
      const actualOrigin = new URL(absUrl).origin;
      if (actualOrigin !== expectedOrigin) {
        console.error(`[companion] refusing update from different origin: expected ${expectedOrigin}, got ${actualOrigin}`);
        return;
      }
    } catch {
      console.error('[companion] refusing update — could not parse server/download URL for origin check');
      return;
    }
  }
  if (absUrl.startsWith('http:')) {
    console.warn('[companion] update download is using plain HTTP — no transport encryption');
  }
  const ext = path.extname(absUrl.split('?')[0] ?? '') || osAdapter.updateExtension;
  // random suffix prevents predictable temp path (TOCTOU)
  const dest = path.join(app.getPath('temp'), `attraccess-companion-update-${version}-${randomBytes(4).toString('hex')}${ext}`);

  console.info(`[companion] downloading update v${version} from ${absUrl}`);
  try {
    await downloadFile(absUrl, dest);
    if (sha256) {
      const actual = await computeSha256(dest);
      if (actual !== sha256) {
        fs.unlink(dest, () => undefined);
        console.error(`[companion] update v${version} checksum mismatch — expected ${sha256}, got ${actual}`);
        state.tray?.setToolTip(`Attraccess Companion — update v${version} checksum failed`);
        return;
      }
    } else {
      // Fail closed: refuse to auto-apply updates without a checksum. The server
      // should always supply sha256 for builds produced by copy-companion-into-assets.js.
      fs.unlink(dest, () => undefined);
      console.error(`[companion] update v${version} has no checksum — refusing to apply`);
      state.tray?.setToolTip(`Attraccess Companion — update v${version} missing checksum`);
      return;
    }
  } catch (err) {
    console.error('[companion] update download failed:', err);
    state.tray?.setToolTip(`Attraccess Companion — update v${version} download failed`);
    return;
  }

  console.info(`[companion] update downloaded to ${dest}`);
  await osAdapter.applyUpdate(dest, version, () => { state.allowQuit = true; });
}

// ─── WebSocket wiring ─────────────────────────────────────────────────────────

function startWsClient(serverUrl: string, firstRun: boolean): void {
  state.wsClient?.stop();
  state.wsClient = new CompanionWsClient(serverUrl);

  state.wsClient.on('connected', () => {
    state.wsConnected = true;
    setTrayState('unlocked');
    state.mainWindow?.webContents.send('ws-status', 'connected');
    startIdleDetection();
    startForegroundAppMonitoring();
  });

  state.wsClient.on('disconnected', () => {
    state.wsConnected = false;
    stopIdleDetection();
    stopForegroundAppMonitoring();
    setTrayState('disconnected');
    state.mainWindow?.webContents.send('ws-status', 'disconnected');
  });

  state.wsClient.on('request_authentication', () => {
    if (firstRun || !state.creds?.id) {
      state.wsClient?.sendRegister();
    } else {
      state.wsClient?.sendAuthenticate({ id: state.creds.id, token: state.creds.token, platform: process.platform, arch: process.arch, appVersion: app.getVersion() });
    }
  });

  state.wsClient.on('register_response', async (payload: CompanionRegisterResponseDto) => {
    const url = state.creds?.serverUrl ?? '';
    state.creds = { serverUrl: url, id: payload.id, token: payload.token };
    await saveCredentials(state.creds);
    firstRun = false;
    state.mainWindow?.webContents.send('registered', { id: payload.id });
    // server only sends AUTHENTICATED in reply to AUTHENTICATE; register alone
    // never authenticates, so do it now instead of waiting for a relaunch
    state.wsClient?.sendAuthenticate({ id: payload.id, token: payload.token, platform: process.platform, arch: process.arch, appVersion: app.getVersion() });

    // install OS startup entry so the companion launches automatically after login
    osAdapter.installStartupEntry(app).catch((err) =>
      console.warn('[companion] startup entry install failed:', err),
    );
  });

  state.wsClient.on('authenticated', async (payload: CompanionAuthenticatedDto) => {
    state.authenticatedPayload = payload;
    state.serverLocked = payload.locked;
    state.mainWindow?.webContents.send('authenticated', payload);
    openKiosk(payload);
    // restore persisted lock state so a restart doesn't silently unlock
    if (!state.adminOverride) setTrayState(payload.locked ? 'locked' : 'unlocked');
    if (!state.adminOverride) {
      if (payload.locked) showKioskOverlay();
      else hideKioskOverlay();
    }
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      setTimeout(() => state.mainWindow?.close(), 1500);
    }
  });

  state.wsClient.on('lock_pc', () => handleLockPc(lockComputer, setTrayState, reloadKiosk));

  state.wsClient.on('unlock_pc', () => handleUnlockPc(unlockComputer, setTrayState));

  state.wsClient.on('device_renamed', (payload) => {
    if (state.authenticatedPayload) {
      state.authenticatedPayload = { ...state.authenticatedPayload, deviceName: payload.deviceName };
    }
  });

  state.wsClient.on('update_available', (payload) => {
    if (state.updateInProgress) {
      console.info(`[companion] update already in progress, ignoring update_available for v${payload.version}`);
      return;
    }
    state.updateInProgress = true;
    state.tray?.setToolTip(`Attraccess Companion — downloading update v${payload.version}…`);
    applyUpdate(state.creds?.serverUrl ?? serverUrl, payload.downloadUrl, payload.version, payload.sha256)
      .catch((err) => console.error('[companion] applyUpdate error:', err))
      .finally(() => { state.updateInProgress = false; });
  });

  state.wsClient.connect();
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

function allPermissionsGranted(): boolean {
  const { needed, accessibility } = osAdapter.permissionsStatus();
  return !needed || accessibility;
}

app.whenReady().then(async () => {
  setupTray();
  state.settings = loadSettings();
  state.onAdminOverrideDisable = disableAdminOverride;

  [state.creds, state.pinHash] = await Promise.all([loadCredentials(), loadPin()]);

  if (!state.creds?.serverUrl || !state.creds?.id) {
    openWizardWindow();
  } else if (!allPermissionsGranted() || !state.pinHash) {
    // Existing device missing permissions or a PIN (e.g. registered before PINs
    // existed): run the wizard to fix both before connecting. A connection must
    // never be established without a PIN.
    openWizardWindow();
  } else {
    startWsClient(state.creds.serverUrl, false);
  }
});

app.on('window-all-closed', () => {
  // keep running in tray
});

app.on('before-quit', (event) => {
  // A locked machine must never be quittable — not even with a PIN. It unlocks
  // only when the server says so.
  if (state.kioskLocked && !state.allowQuit) {
    event.preventDefault();
    return;
  }
  if (state.pinHash && !state.allowQuit) {
    event.preventDefault();
    openWizardWindow({ requirePin: 'quit' });
    return;
  }
  state.allowQuit = false;
  stopIdleDetection();
  stopForegroundAppMonitoring();
  hideKioskOverlay();
  state.wsClient?.stop();
});

export {};
