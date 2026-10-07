import { BrowserWindow, Menu, session } from 'electron';
import type { CompanionAuthenticatedDto } from '@attraccess/companion-ws-client';
import { state } from './state';
import { openWizardWindow } from './wizard-window';
import { kioskUrl } from './kiosk.helpers';

export // ponytail: increment per new kiosk window so each open gets a fresh web session (sign-out on close)
let _kioskSessionId = 0;

export function openKiosk(payload: CompanionAuthenticatedDto): void {
  if (state.kioskWindow && !state.kioskWindow.isDestroyed()) {
    state.kioskWindow.loadURL(kioskUrl(payload));
    return;
  }

  const ses = session.fromPartition(`memory:kiosk-${++_kioskSessionId}`, { cache: false });
  const win = new BrowserWindow({
    show: false,
    frame: true,
    webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true },
  });

  win.loadURL(kioskUrl(payload));
  win.on('close', (event) => {
    if (state.kioskLocked) event.preventDefault();
  });
  win.on('closed', () => {
    state.kioskWindow = null;
  });
  win.webContents.on('context-menu', () => {
    // ponytail: isPinSet guard — no PIN means verifyPin always fails, skip rather than show a stuck dialog
    const items = state.adminOverride
      ? [{ label: 'Disable Admin Override', click: () => state.onAdminOverrideDisable?.() }]
      : state.pinHash
        ? [{ label: 'Admin Override…', click: () => openWizardWindow({ requirePin: 'admin-override' }) }]
        : [];
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
  state.kioskWindow = win;
}
