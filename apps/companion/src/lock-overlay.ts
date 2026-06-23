import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

// out/main.js lives in out/; src/index.html is one level up
const LOCKSCREEN_HTML = path.join(__dirname, '..', 'src', 'index.html');

let overlays: BrowserWindow[] = [];
let quitting = false;

/**
 * Call before app.quit() so overlay close handlers don't block shutdown.
 */
export function markQuitting(): void {
  quitting = true;
}

function wireOverlayHandlers(win: BrowserWindow): void {
  // prevent the user from closing the overlay (Cmd+W etc.)
  win.on('close', (e) => { if (!quitting) e.preventDefault(); });
  win.on('closed', () => { overlays = overlays.filter((w) => w !== win); });
}

/**
 * Shows a full-screen lock overlay on every connected display.
 * Idempotent — calling twice has no effect until hideLockOverlay() is called.
 */
export function showLockOverlay(): void {
  if (overlays.length > 0) return;

  for (const display of screen.getAllDisplays()) {
    const { x, y, width, height } = display.bounds;
    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      minimizable: false,
      focusable: true,
      skipTaskbar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    win.setAlwaysOnTop(true, 'screen-saver');

    // ponytail: simpleFullScreen avoids a new macOS Space; other platforms use
    // native fullscreen. Both hide the menu bar and cover system UI.
    if (process.platform === 'darwin') {
      win.setSimpleFullScreen(true);
    } else {
      win.setFullScreen(true);
    }

    win.loadFile(LOCKSCREEN_HTML);

    wireOverlayHandlers(win);

    overlays.push(win);
  }
}

/**
 * Removes all lock overlay windows.
 */
export function hideLockOverlay(): void {
  for (const win of overlays) {
    if (!win.isDestroyed()) {
      try {
        if (process.platform === 'darwin') win.setSimpleFullScreen(false);
        else win.setFullScreen(false);
        win.destroy();
      } catch {
        // already being destroyed
      }
    }
  }
  overlays = [];
}
