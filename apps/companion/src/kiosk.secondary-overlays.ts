import { BrowserWindow, globalShortcut } from 'electron';
import { state } from './state';
import { attraccessLogoSvg } from './logo-svg';
export // blocker pages that cover secondary displays while the kiosk is locked
let secondaryOverlays: BrowserWindow[] = [];

export function addSecondaryOverlay(x: number, y: number, width: number, height: number): void {
  const overlay = new BrowserWindow({
    x,
    y,
    width,
    height,
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
  overlay.on('closed', () => {
    secondaryOverlays = secondaryOverlays.filter((w) => w !== overlay);
  });
  secondaryOverlays.push(overlay);
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
    const kill = () => {
      if (!w.isDestroyed()) w.destroy();
    };
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
      const doHide = () => {
        if (!win.isDestroyed()) win.hide();
      };
      win.once('leave-full-screen', doHide);
      win.setKiosk(false);
      setTimeout(doHide, 1000);
    } else {
      if (process.platform !== 'darwin') win.setFullScreen(false);
      win.hide();
    }
  }
}
