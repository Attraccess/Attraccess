import { BrowserWindow, Menu, session, screen, globalShortcut } from 'electron';
import type { CompanionAuthenticatedDto } from '@attraccess/companion-ws-client';
import { state } from './state';
import { osAdapter } from './platform-adapter';
import { attraccessLogoSvg } from './logo-svg';
import { openWizardWindow } from './wizard-window';

// ponytail: increment per new kiosk window so each open gets a fresh web session (sign-out on close)
let _kioskSessionId = 0;

// blocker pages that cover secondary displays while the kiosk is locked
let secondaryOverlays: BrowserWindow[] = [];

function kioskUrl(payload: CompanionAuthenticatedDto): string {
  const base = state.creds?.serverUrl ?? '';
  const timeout = `autoLogoff=${state.autoLogoffSeconds}`;
  if (payload.resources.length === 1) {
    return `${base}/kiosk/resources/${payload.resources[0].id}?${timeout}`;
  }
  return `${base}/kiosk/companion?deviceId=${payload.deviceId}&${timeout}`;
}

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
  win.on('close', (event) => { if (state.kioskLocked) event.preventDefault(); });
  win.on('closed', () => { state.kioskWindow = null; });
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

function registerLockShortcuts(): void {
  for (const accel of osAdapter.lockShortcuts()) {
    try {
      globalShortcut.register(accel, () => undefined);
    } catch (err) {
      // OS-reserved shortcuts cannot be overridden; log so failures are visible
      console.warn(`[companion] could not register lock shortcut "${accel}":`, err);
    }
  }
}

function addSecondaryOverlay(x: number, y: number, width: number, height: number): void {
  const overlay = new BrowserWindow({
    x, y, width, height,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#ffffff',
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
  // Centered "Locked by" + Attraccess lockup. color: drives the wordmark.
  const blockerHtml =
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"></head><body style="margin:0;min-height:100vh;box-sizing:border-box;` +
    `border-top:6px solid #256D7B;display:flex;flex-direction:column;align-items:center;justify-content:center;` +
    `gap:1.25rem;background:#ffffff;color:#256D7B">` +
    `<span style="font:500 14px/1 system-ui,sans-serif;letter-spacing:.06em;color:#536369">Locked by</span>` +
    `<div style="width:38vw;max-width:520px">${attraccessLogoSvg}</div></body></html>`;
  overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(blockerHtml));
  overlay.on('closed', () => { secondaryOverlays = secondaryOverlays.filter(w => w !== overlay); });
  secondaryOverlays.push(overlay);
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

export function hideKioskOverlay(): void {
  state.kioskLocked = false;
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

  const win = state.kioskWindow;
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

export function lockComputer(): void {
  // Attempt OS-level lock (e.g. LockWorkStation on Windows) as an extra security
  // layer. The Electron overlay is always shown regardless — it is the
  // authoritative server-controlled lock that unlock_pc can dismiss.
  osAdapter.tryOsLock().catch((err) =>
    console.warn('[companion] OS lock failed:', err),
  );
  showKioskOverlay();
}

export function unlockComputer(): void {
  osAdapter.onUnlock?.();
  hideKioskOverlay();
}
