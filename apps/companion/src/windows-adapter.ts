import type { App } from 'electron';
import type { OsAdapter } from './platform-adapter';
import { lockWorkStation, installAutostart } from './windows-lock';

export class WindowsAdapter implements OsAdapter {
  tryOsLock(): Promise<boolean> {
    return lockWorkStation();
  }

  installStartupEntry(app: App): Promise<void> {
    return installAutostart(app.getPath('exe'));
  }

  permissionsStatus() {
    return { needed: false, accessibility: true } as const;
  }

  requestPermissions(): void {
    // no special permissions required on Windows
  }

  lockShortcuts(): readonly string[] {
    return [
      'CommandOrControl+Q',
      'CommandOrControl+W',
      'Alt+F4',
      'Control+Shift+Escape', // Task Manager
      'Super',
      'Super+D',              // Show desktop
      'Super+R',              // Run dialog
      'Super+X',              // Quick Link menu
      'Control+Escape',       // Start menu (Alt path)
      // Alt+Tab / Win+Tab are OS-reserved — registration will fail silently
    ];
  }
}
