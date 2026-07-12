import { BrowserWindow } from 'electron';
import * as path from 'path';
import { state } from './state';

export interface WizardOpts {
  requirePin?: 'settings' | 'quit' | 'admin-override';
}

export function openWizardWindow(opts: WizardOpts = {}): void {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    if (opts.requirePin) {
      // Close existing window and reopen as PIN dialog
      state.mainWindow.destroy();
    } else {
      state.mainWindow.focus();
      return;
    }
  }

  const win = new BrowserWindow({
    width: 520,
    height: 460,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: false,
    },
  });

  // dev: load the Vite HMR server; prod: __dirname is out/, renderer/dist/ has the build
  const devUrl = process.env.COMPANION_DEV_RENDERER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
  }
  // Admin-override PIN dialog must appear above screen-saver-level kiosk overlays
  if (opts.requirePin === 'admin-override') {
    win.setAlwaysOnTop(true, 'screen-saver');
  }

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('init', {
      serverUrl: state.creds?.serverUrl,
      requirePin: opts.requirePin,
      registered: !!state.creds?.id,
      connected: state.wsConnected,
    });
  });
  win.on('closed', () => { state.mainWindow = null; });
  state.mainWindow = win;
}
