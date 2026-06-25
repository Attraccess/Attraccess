import { execFile } from 'child_process';

/**
 * Invokes Win32 LockWorkStation() via rundll32 — best-effort.
 * Returns true if the call exits cleanly, false otherwise or on non-Windows.
 */
export function lockWorkStation(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile('rundll32.exe', ['user32.dll,LockWorkStation'], (err) => resolve(!err));
  });
}

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_VALUE = 'AttraccessCompanion';

/**
 * Adds the companion app to the Windows user startup run-key so it launches
 * automatically after login. No-op on non-Windows.
 */
export async function installAutostart(execPath: string): Promise<void> {
  if (process.platform !== 'win32') return;
  await new Promise<void>((resolve, reject) => {
    execFile(
      'reg',
      ['add', RUN_KEY, '/v', RUN_VALUE, '/t', 'REG_SZ', '/d', execPath, '/f'],
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

/**
 * Returns true when the startup registry value is present. No-op (false) on non-Windows.
 */
export async function isAutostartInstalled(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  return new Promise((resolve) => {
    execFile('reg', ['query', RUN_KEY, '/v', RUN_VALUE], (err) => resolve(!err));
  });
}
