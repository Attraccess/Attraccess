import type { App } from 'electron';
import { WindowsAdapter } from './windows-adapter';
import { MacosAdapter } from './macos-adapter';
import { LinuxAdapter } from './linux-adapter';
import { NullAdapter } from './null-adapter';

export interface OsAdapter {
  /**
   * Attempt to engage an OS-level lock (e.g. Win32 LockWorkStation).
   * Best-effort: the Electron kiosk overlay is always shown regardless.
   * Returns true when the OS lock was successfully invoked.
   */
  tryOsLock(): Promise<boolean>;

  /** Add the companion to OS startup so it auto-launches after login. */
  installStartupEntry(app: App): Promise<void>;

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

export const osAdapter: OsAdapter =
  process.platform === 'win32' ? new WindowsAdapter() :
  process.platform === 'darwin' ? new MacosAdapter() :
  process.platform === 'linux' ? new LinuxAdapter() :
  new NullAdapter();
