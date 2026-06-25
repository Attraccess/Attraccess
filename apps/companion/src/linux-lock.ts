import { execFile, spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
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

// ─── VT switch lock ──────────────────────────────────────────────────────────

// Python3 subprocess that calls VT_LOCKSWITCH on the session's VT device.
// Requires CAP_SYS_TTY_CONFIG; fails gracefully when unavailable.
// The process holds the lock until its stdin is closed (normal release) or it
// receives SIGTERM (crash/kill path) — both paths run atexit → VT_UNLOCKSWITCH.
const VT_LOCK_SCRIPT = [
  "import fcntl,os,sys,subprocess,re,signal,atexit",
  "VT_LOCKSWITCH=0x5600",
  "VT_UNLOCKSWITCH=0x5601",
  "_fd=None",
  "def _unlock():",
  "    global _fd",
  "    if _fd is not None:",
  "        try: fcntl.ioctl(_fd,VT_UNLOCKSWITCH)",
  "        except: pass",
  "        try: os.close(_fd)",
  "        except: pass",
  "        _fd=None",
  "atexit.register(_unlock)",
  "signal.signal(signal.SIGTERM,lambda *a:sys.exit(0))",
  "signal.signal(signal.SIGHUP,lambda *a:sys.exit(0))",
  "try:",
  "    sid=os.environ.get('XDG_SESSION_ID','')",
  "    cmd=['loginctl','show-session']+([sid] if sid else [])+['-p','VTNr']",
  "    r=subprocess.run(cmd,capture_output=True,text=True,timeout=3)",
  "    m=re.search(r'VTNr=(\\d+)',r.stdout)",
  "    if not m: sys.stdout.write('err:no-vtnr\\n'); sys.stdout.flush(); sys.exit(1)",
  "    _fd=os.open('/dev/tty'+m.group(1),os.O_RDWR)",
  "    fcntl.ioctl(_fd,VT_LOCKSWITCH)",
  "    sys.stdout.write('locked\\n')",
  "    sys.stdout.flush()",
  "    sys.stdin.read()",
  "except PermissionError: sys.stdout.write('err:perm\\n'); sys.stdout.flush(); sys.exit(1)",
  "except Exception as e: sys.stdout.write('err:'+str(e)+'\\n'); sys.stdout.flush(); sys.exit(1)",
].join('\n');

let _vtProc: ChildProcess | null = null;

/**
 * Attempt to block VT switching (Ctrl+Alt+Fx) via VT_LOCKSWITCH ioctl.
 * Spawns a python3 subprocess that holds the lock until releaseVtLock() is called.
 * Returns true when the VT was successfully locked, false when unavailable or
 * when the process lacks CAP_SYS_TTY_CONFIG (graceful degradation).
 */
export async function tryVtLock(): Promise<boolean> {
  if (process.platform !== 'linux') return false;
  if (_vtProc) return true;

  return new Promise<boolean>((resolve) => {
    const proc = spawn('python3', ['-u', '-c', VT_LOCK_SCRIPT], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });

    let resolved = false;
    let buf = '';
    let timer: ReturnType<typeof setTimeout> | null = null;

    const settle = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      if (timer !== null) clearTimeout(timer);
      if (!ok) proc.kill();
      resolve(ok);
    };

    proc.stdout?.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      if (!resolved && buf.includes('locked')) { _vtProc = proc; settle(true); }
      else if (!resolved && buf.includes('err:')) settle(false);
    });

    proc.on('exit', () => {
      if (_vtProc === proc) _vtProc = null;
      settle(false);
    });

    timer = setTimeout(() => settle(false), 3000);
  });
}

/** Release the VT switch lock, restoring normal VT switching. */
export function releaseVtLock(): void {
  if (!_vtProc) return;
  _vtProc.stdin?.end();
  _vtProc = null;
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
