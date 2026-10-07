import type { CompanionAuthenticatedDto } from '@attraccess/companion-ws-client';
import { state } from './state';
import { osAdapter } from './platform-adapter';
import { globalShortcut } from 'electron';
import { openKiosk } from './kiosk.-kiosk-session-id';
import { screen } from 'electron';
import { addSecondaryOverlay } from './kiosk.secondary-overlays';
import { hideKioskOverlay } from './kiosk.secondary-overlays';

export function kioskUrl(payload: CompanionAuthenticatedDto): string {
  const base = state.creds?.serverUrl ?? '';
  const timeout = `autoLogoff=${state.autoLogoffSeconds}`;
  if (payload.resources.length === 1) {
    return `${base}/kiosk/resources/${payload.resources[0].id}?${timeout}`;
  }
  return `${base}/kiosk/companion?deviceId=${payload.deviceId}&${timeout}`;
}

export function registerLockShortcuts(): void {
  for (const accel of osAdapter.lockShortcuts()) {
    try {
      globalShortcut.register(accel, () => undefined);
    } catch (err) {
      // OS-reserved shortcuts cannot be overridden; log so failures are visible
      console.warn(`[companion] could not register lock shortcut "${accel}":`, err);
    }
  }
}

export function showKioskOverlay(): void {
  const win = state.kioskWindow;
  if (!win || win.isDestroyed()) return;

  state.kioskLocked = true;
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

  // cover any other displays with blocker pages
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

export function lockComputer(): void {
  // Attempt OS-level lock (e.g. LockWorkStation on Windows) as an extra security
  // layer. The Electron overlay is always shown regardless — it is the
  // authoritative server-controlled lock that unlock_pc can dismiss.
  osAdapter.tryOsLock().catch((err) => console.warn('[companion] OS lock failed:', err));
  showKioskOverlay();
}

export function reloadKiosk(): void {
  const win = state.kioskWindow;
  if (!win || win.isDestroyed()) return;
  win.loadURL('about:blank').then(() => {
    if (state.authenticatedPayload) win.loadURL(kioskUrl(state.authenticatedPayload));
  });
}

export function reopenKiosk(): void {
  if (!state.authenticatedPayload) return;
  openKiosk(state.authenticatedPayload);
  const win = state.kioskWindow;
  if (!win || win.isDestroyed()) return;
  state.kioskLocked = false;
  win.setAlwaysOnTop(false);
  if (process.platform === 'darwin') win.setKiosk(false);
  else win.setFullScreen(false);
  win.setResizable(true);
  win.setSize(960, 720);
  win.center();
  win.show();
  win.focus();
}

export function unlockComputer(): void {
  osAdapter.onUnlock?.();
  hideKioskOverlay();
}
