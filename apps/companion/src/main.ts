import { app, ipcMain } from 'electron';
import { hashPin, verifyPinHash } from './pin';
import { loadCredentials, clearCredentials, loadPin, savePin } from './keychain';
import { normalizeServerUrl } from './server-url';
import { osAdapter } from './platform-adapter';
import { state } from './state';
import { loadSettings, saveSettings, SETTINGS_DEFAULTS, CompanionSettings } from './settings';
import { startIdleDetection, stopIdleDetection } from './idle-detection';
import { startForegroundAppMonitoring, stopForegroundAppMonitoring } from './foreground-app';
import { startUsbDevicesMonitoring, stopUsbDevicesMonitoring } from './usb-devices';
import { hideKioskOverlay } from './kiosk';
import { setupTray, setTrayState } from './tray';
import { openWizardWindow } from './wizard-window';
import { checkHealth } from './main.helpers';
import { recordPinFailure, recordPinSuccess } from './main.-pin-failures';
import { pinAllowed } from './main.pin-allowed';
import { enableAdminOverride } from './main.helpers';
import { disableAdminOverride } from './main.helpers';
import { startWsClient } from './main.start-ws-client';
import { allPermissionsGranted } from './main.helpers';

// ─── Health check ─────────────────────────────────────────────────────────────
// ─── PIN rate limiting ────────────────────────────────────────────────────────
// ponytail: simple exponential backoff; resets on success. Doubles up to 30s.
// ─── Admin override ───────────────────────────────────────────────────────────
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
  if (ok) recordPinSuccess();
  else recordPinFailure();
  return ok;
});

ipcMain.handle('enable-admin-override', (_evt, pin: string) => {
  if (!pinAllowed()) return false;
  if (!verifyPinHash(pin, state.pinHash)) {
    recordPinFailure();
    return false;
  }
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
    stopUsbDevicesMonitoring();
    startUsbDevicesMonitoring();
  }
});

// ─── Auto-update ──────────────────────────────────────────────────────────────
// ─── WebSocket wiring ─────────────────────────────────────────────────────────
// ─── App lifecycle ────────────────────────────────────────────────────────────
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
  stopUsbDevicesMonitoring();
  hideKioskOverlay();
  state.wsClient?.stop();
});

export {};
