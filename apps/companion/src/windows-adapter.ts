import type { App } from 'electron';
import { app } from 'electron';
import { spawn } from 'child_process';
import type { OsAdapter } from './platform-adapter';
import { lockWorkStation, installAutostart } from './windows-lock';

export class WindowsAdapter implements OsAdapter {
  readonly updateExtension = '.exe';
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

  async applyUpdate(dest: string, _version: string, allowQuit: () => void): Promise<void> {
    // Spawn the NSIS installer silently (/S) as a detached process so it outlives
    // this process. NSIS waits for the target app to fully exit before overwriting,
    // so calling app.quit() immediately after is safe.
    const child = spawn(dest, ['/S'], { detached: true, stdio: 'ignore' });
    child.on('error', (err) => console.error('[companion] failed to launch Windows installer:', err));
    child.unref();
    allowQuit();
    app.quit();
  }
}
