import { execFile } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fsp from 'fs/promises';

// ─── OS lock ─────────────────────────────────────────────────────────────────

function run(bin: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, args, (err) => resolve(!err));
  });
}

/**
 * Tries to engage the system screen locker.
 * Primary: loginctl lock-session  (systemd-logind; works on X11 and Wayland)
 * Fallback: xdg-screensaver lock  (X11 screen-saver protocol)
 * Returns true if either succeeds, false on non-Linux.
 */
export async function tryLockSession(): Promise<boolean> {
  if (process.platform !== 'linux') return false;

  if (await run('loginctl', ['lock-session'])) return true;
  return run('xdg-screensaver', ['lock']);
}

// ─── Autostart ───────────────────────────────────────────────────────────────

const CONFIG_HOME = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
const AUTOSTART_DIR = path.join(CONFIG_HOME, 'autostart');
const AUTOSTART_DESKTOP = path.join(AUTOSTART_DIR, 'attraccess-companion.desktop');
const SYSTEMD_USER_DIR = path.join(CONFIG_HOME, 'systemd', 'user');
const SYSTEMD_SERVICE = path.join(SYSTEMD_USER_DIR, 'attraccess-companion.service');

function buildDesktopEntry(execPath: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Attraccess Companion',
    `Exec=${execPath}`,
    'X-GNOME-Autostart-enabled=true',
    'Hidden=false',
    'NoDisplay=false',
    'Comment=Attraccess Companion — lock/unlock integration',
    '',
  ].join('\n');
}

function buildSystemdService(execPath: string): string {
  return [
    '[Unit]',
    'Description=Attraccess Companion',
    '',
    '[Service]',
    `ExecStart=${execPath}`,
    'Restart=on-failure',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

/**
 * Writes an XDG autostart .desktop entry and a systemd user service so the
 * companion launches automatically on login.
 * No-op on non-Linux.
 */
export async function installDesktopAutostart(execPath: string): Promise<void> {
  if (process.platform !== 'linux') return;

  await Promise.all([
    fsp.mkdir(AUTOSTART_DIR, { recursive: true }).then(() =>
      fsp.writeFile(AUTOSTART_DESKTOP, buildDesktopEntry(execPath), 'utf-8'),
    ),
    fsp.mkdir(SYSTEMD_USER_DIR, { recursive: true }).then(() =>
      fsp.writeFile(SYSTEMD_SERVICE, buildSystemdService(execPath), 'utf-8'),
    ),
  ]);
}

/**
 * Returns true when both the .desktop entry and the systemd service are present.
 */
export async function isAutostartInstalled(): Promise<boolean> {
  try {
    await Promise.all([fsp.access(AUTOSTART_DESKTOP), fsp.access(SYSTEMD_SERVICE)]);
    return true;
  } catch {
    return false;
  }
}
