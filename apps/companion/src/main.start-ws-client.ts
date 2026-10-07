import { app } from 'electron';
import {
  CompanionWsClient,
  CompanionAuthenticatedDto,
  CompanionRegisterResponseDto,
} from '@attraccess/companion-ws-client';
import { saveCredentials } from './keychain';
import { osAdapter } from './platform-adapter';
import { state } from './state';
import { startIdleDetection, stopIdleDetection } from './idle-detection';
import { startForegroundAppMonitoring, stopForegroundAppMonitoring } from './foreground-app';
import { startUsbDevicesMonitoring, stopUsbDevicesMonitoring } from './usb-devices';
import { openKiosk, reloadKiosk, lockComputer, unlockComputer, showKioskOverlay, hideKioskOverlay } from './kiosk';
import { setTrayState } from './tray';
import { handleLockPc, handleUnlockPc } from './admin-override';
import { applyUpdate } from './main.helpers';

export // ─── WebSocket wiring ─────────────────────────────────────────────────────────

function startWsClient(serverUrl: string, firstRun: boolean): void {
  state.wsClient?.stop();
  state.wsClient = new CompanionWsClient(serverUrl);

  state.wsClient.on('connected', () => {
    state.wsConnected = true;
    setTrayState('unlocked');
    state.mainWindow?.webContents.send('ws-status', 'connected');
    startIdleDetection();
    startForegroundAppMonitoring();
    startUsbDevicesMonitoring();
  });

  state.wsClient.on('disconnected', () => {
    state.wsConnected = false;
    stopIdleDetection();
    stopForegroundAppMonitoring();
    stopUsbDevicesMonitoring();
    setTrayState('disconnected');
    state.mainWindow?.webContents.send('ws-status', 'disconnected');
  });

  state.wsClient.on('request_authentication', () => {
    if (firstRun || !state.creds?.id) {
      state.wsClient?.sendRegister();
    } else {
      state.wsClient?.sendAuthenticate({
        id: state.creds.id,
        token: state.creds.token,
        platform: process.platform,
        arch: process.arch,
        appVersion: app.getVersion(),
      });
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
    state.wsClient?.sendAuthenticate({
      id: payload.id,
      token: payload.token,
      platform: process.platform,
      arch: process.arch,
      appVersion: app.getVersion(),
    });

    // install OS startup entry so the companion launches automatically after login
    osAdapter.installStartupEntry(app).catch((err) => console.warn('[companion] startup entry install failed:', err));
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
      .finally(() => {
        state.updateInProgress = false;
      });
  });

  state.wsClient.connect();
}
