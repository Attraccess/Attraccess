import type { App } from 'electron';
import type { OsAdapter } from './platform-adapter';
import {
  hasAccessibilityPermission,
  promptAccessibilityPermission,
  installLaunchAgent,
} from './macos-lock';

export class MacosAdapter implements OsAdapter {
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
}
