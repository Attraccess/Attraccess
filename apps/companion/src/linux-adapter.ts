import type { App } from 'electron';
import type { OsAdapter } from './platform-adapter';
import { tryLockSession, installDesktopAutostart } from './linux-lock';

export class LinuxAdapter implements OsAdapter {
  tryOsLock(): Promise<boolean> {
    return tryLockSession();
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
    ];
  }
}
