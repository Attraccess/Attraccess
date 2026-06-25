// Thin dispatch table — routes each cross-platform OS action to the correct
// platform implementation. main.ts depends only on this file; the platform
// modules (macos-lock, windows-lock) are imported here with explicit prefixes
// so the mapping is obvious at a glance.

import {
  hasAccessibilityPermission as macosHasAccessibilityPermission,
  promptAccessibilityPermission as macosPromptAccessibilityPermission,
  installLaunchAgent as macosInstallStartupEntry,
} from './macos-lock';

import {
  lockWorkStation as windowsLockWorkStation,
  installAutostart as windowsInstallStartupEntry,
} from './windows-lock';

export interface OsAdapter {
  /**
   * Attempt to engage an OS-level lock (e.g. Win32 LockWorkStation).
   * Best-effort: the Electron kiosk overlay is always shown regardless.
   * Returns true when the OS lock was successfully invoked.
   */
  tryOsLock(): Promise<boolean>;

  /** Add the companion to OS startup so it auto-launches after login. */
  installStartupEntry(execPath: string): Promise<void>;

  /** Snapshot of platform-specific permission state for the renderer wizard. */
  permissionsStatus(): { needed: boolean; accessibility: boolean };

  /** Trigger the OS permission request flow (no-op if no permissions are needed). */
  requestPermissions(): void;

  /**
   * Global shortcuts to register while the lock overlay is active.
   * Each platform returns the keyboard escapes relevant to that OS.
   * Shortcuts that the OS reserves and cannot be overridden will silently
   * fail — the caller wraps each registration in try/catch.
   */
  lockShortcuts(): readonly string[];
}

const windowsAdapter: OsAdapter = {
  tryOsLock: () => windowsLockWorkStation(),
  installStartupEntry: (execPath) => windowsInstallStartupEntry(execPath),
  permissionsStatus: () => ({ needed: false, accessibility: true }),
  requestPermissions: () => undefined,
  lockShortcuts: () => [
    'CommandOrControl+Q',
    'CommandOrControl+W',
    'Alt+F4',
    'Control+Shift+Escape', // Task Manager
    'Super',
    'Super+D',              // Show desktop
    'Super+R',              // Run dialog
    'Super+X',              // Quick Link menu
    'Control+Escape',       // Start menu (Alt path)
    // Alt+Tab / Win+Tab are OS-reserved and will silently fail — that is fine
  ],
};

const macosAdapter: OsAdapter = {
  // macOS kiosk lock is done inside showKioskOverlay() via win.setKiosk(true);
  // there is no separate OS lock step analogous to LockWorkStation.
  tryOsLock: async () => false,
  installStartupEntry: (execPath) => macosInstallStartupEntry(execPath),
  permissionsStatus: () => ({
    needed: true,
    accessibility: macosHasAccessibilityPermission(),
  }),
  requestPermissions: () => macosPromptAccessibilityPermission(),
  // setKiosk(true) already blocks Cmd+Tab, Mission Control, Spaces, force-quit,
  // and app-hide via NSApplicationPresentationOptions. This list covers the gaps
  // those presentation options leave.
  lockShortcuts: () => [
    'CommandOrControl+Q',
    'CommandOrControl+W',
    'CommandOrControl+M',      // minimize
    'CommandOrControl+H',      // hide
    'CommandOrControl+Space',  // Spotlight
    'CommandOrControl+Alt+Space',
    'CommandOrControl+`',      // cycle app windows
  ],
};

const nullAdapter: OsAdapter = {
  tryOsLock: async () => false,
  installStartupEntry: async () => undefined,
  permissionsStatus: () => ({ needed: false, accessibility: true }),
  requestPermissions: () => undefined,
  lockShortcuts: () => [],
};

export const osAdapter: OsAdapter =
  process.platform === 'win32' ? windowsAdapter :
  process.platform === 'darwin' ? macosAdapter :
  nullAdapter;
