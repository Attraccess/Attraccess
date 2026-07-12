import type { App } from 'electron';
import { app, dialog, shell } from 'electron';
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { OsAdapter } from './platform-adapter';
import {
  hasAccessibilityPermission,
  promptAccessibilityPermission,
  installLaunchAgent,
} from './macos-lock';

export class MacosAdapter implements OsAdapter {
  readonly updateExtension = '.dmg';

  async tryOsLock(): Promise<boolean> {
    // macOS kiosk lock is engaged inside showKioskOverlay() via win.setKiosk(true);
    // there is no separate OS lock step analogous to Win32 LockWorkStation.
    return false;
  }

  installStartupEntry(app: App): Promise<void> {
    return installLaunchAgent(app.getPath('exe'));
  }

  permissionsStatus() {
    return { needed: true, accessibility: hasAccessibilityPermission() };
  }

  requestPermissions(): void {
    promptAccessibilityPermission();
  }

  // setKiosk(true) already blocks Cmd+Tab, Mission Control, Spaces, force-quit,
  // and app-hide via NSApplicationPresentationOptions. These cover the gaps.
  lockShortcuts(): readonly string[] {
    return [
      'CommandOrControl+Q',
      'CommandOrControl+W',
      'CommandOrControl+M',      // minimize
      'CommandOrControl+H',      // hide
      'CommandOrControl+Space',  // Spotlight
      'CommandOrControl+Alt+Space',
      'CommandOrControl+`',      // cycle app windows
    ];
  }

  async applyUpdate(dest: string, version: string, _allowQuit: () => void): Promise<void> {
    const tmpMount = path.join(os.tmpdir(), `attraccess-update-${version}-${randomBytes(4).toString('hex')}`);
    try {
      // hdiutil requires the mountpoint directory to exist before attaching
      fs.mkdirSync(tmpMount, { recursive: true });
      execFileSync('hdiutil', ['attach', dest, '-nobrowse', '-quiet', '-mountpoint', tmpMount]);
      const findOutput = execFileSync('find', [tmpMount, '-maxdepth', '1', '-name', '*.app'], { encoding: 'utf8' }).trim();
      const appMatches = findOutput ? findOutput.split('\n') : [];
      if (appMatches.length === 0) throw new Error('no .app bundle found in DMG');
      if (appMatches.length > 1) throw new Error(`ambiguous DMG: ${appMatches.length} .app bundles found`);
      const appInDmg = appMatches[0];
      // Derive the current .app bundle path from the running executable
      // e.g. /Applications/App.app/Contents/MacOS/App → /Applications/App.app
      const currentApp = process.execPath.replace(/\/Contents\/MacOS\/[^/]+$/, '');
      execFileSync('ditto', [appInDmg, currentApp]);
      execFileSync('hdiutil', ['detach', tmpMount, '-quiet']);
      try { fs.unlinkSync(dest); } catch { /* best-effort cleanup */ }
      app.relaunch({ execPath: process.execPath });
      _allowQuit();
      app.quit();
    } catch (err) {
      console.error('[companion] macOS silent update failed, falling back to manual install:', err);
      try { execFileSync('hdiutil', ['detach', tmpMount, '-quiet']); } catch { /* best-effort */ }
      const errMsg = await shell.openPath(dest);
      if (errMsg) { console.error('[companion] failed to open macOS DMG:', errMsg); return; }
      await dialog.showMessageBox({
        type: 'info',
        title: 'Attraccess Companion — Update Ready',
        message: `Version ${version} is ready to install.\n\nDrag "Attraccess Companion" from the opened disk image to your Applications folder, then relaunch.`,
        buttons: ['OK'],
      });
    }
  }
}
