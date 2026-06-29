import type { App } from 'electron';
import { app } from 'electron';
import * as fs from 'fs';
import type { OsAdapter } from './platform-adapter';
import { tryLockSession, installDesktopAutostart, tryVtLock, releaseVtLock } from './linux-lock';

export class LinuxAdapter implements OsAdapter {
  readonly updateExtension = '';
  async tryOsLock(): Promise<boolean> {
    const [sessionLocked] = await Promise.all([
      tryLockSession(),
      tryVtLock().catch(() => false),
    ]);
    return sessionLocked;
  }

  onUnlock(): void {
    releaseVtLock();
  }

  installStartupEntry(app: App): Promise<void> {
    return installDesktopAutostart(app.getPath('exe'));
  }

  permissionsStatus() {
    return { needed: false, accessibility: true } as const;
  }

  requestPermissions(): void {
    // no special permissions required on Linux
  }

  lockShortcuts(): readonly string[] {
    return [
      'CommandOrControl+Q',
      'CommandOrControl+W',
      'Alt+F4',
      'Super',
      'Super+D',              // Show desktop (GNOME/KDE)
      'Super+E',              // File manager (KDE)
      'Control+Alt+T',        // Terminal
      'Control+Alt+D',        // Show desktop (GNOME alt path)
      'Alt+F2',               // Run dialog (KDE / older GNOME)
      'Control+Escape',       // App menu / task manager
      // Alt+Tab is OS-reserved — registration will fail silently
      // VT switch keys — blocked at kernel level via VT_LOCKSWITCH;
      // also registered here for Wayland compositors that surface them to the app
      'Control+Alt+F1', 'Control+Alt+F2', 'Control+Alt+F3',
      'Control+Alt+F4', 'Control+Alt+F5', 'Control+Alt+F6',
      'Control+Alt+F7', 'Control+Alt+F8', 'Control+Alt+F9',
      'Control+Alt+F10', 'Control+Alt+F11', 'Control+Alt+F12',
    ];
  }

  async applyUpdate(dest: string, _version: string, _allowQuit: () => void): Promise<void> {
    try { fs.chmodSync(dest, 0o755); } catch (err) { console.error('[companion] chmod failed:', err); }
    app.relaunch({ execPath: dest });
    app.exit(0); // app.exit bypasses before-quit — no need for allowQuit
  }
}
