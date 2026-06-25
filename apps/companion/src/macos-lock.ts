import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fsp from 'fs/promises';

const execFileAsync = promisify(execFile);

// ─── CGSession lock ───────────────────────────────────────────────────────────

/**
 * Invokes the macOS lock screen via CGSession -suspend.
 * Returns true if the command succeeded; false on non-macOS or failure.
 * Failure usually means the app is sandboxed or CGSession is unavailable.
 */
export async function lockViaCGSession(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  try {
    await execFileAsync('/usr/bin/CGSession', ['-suspend']);
    return true;
  } catch {
    return false;
  }
}

// ─── Accessibility permission ─────────────────────────────────────────────────

/**
 * Returns true if the app has Accessibility permission (needed for full
 * keyboard/mouse event capture via CGEventTap).
 * Always returns true on non-macOS.
 */
export function hasAccessibilityPermission(): boolean {
  if (process.platform !== 'darwin') return true;
  try {
    const { systemPreferences } = require('electron') as typeof import('electron');
    return systemPreferences.isTrustedAccessibilityClient(false);
  } catch {
    return false;
  }
}

/**
 * Triggers the macOS Accessibility permission prompt.
 * No-op on non-macOS.
 */
export function promptAccessibilityPermission(): void {
  if (process.platform !== 'darwin') return;
  try {
    const { systemPreferences, shell } = require('electron') as typeof import('electron');
    // Registers the app in TCC so it appears in the Accessibility list
    systemPreferences.isTrustedAccessibilityClient(true);
    // Open directly to the Accessibility pane — user just needs to toggle the switch
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  } catch {
    // ignore — test env or non-Electron runtime
  }
}

// ─── Launchd user agent ───────────────────────────────────────────────────────

const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
export const LAUNCH_AGENT_PLIST = path.join(
  LAUNCH_AGENTS_DIR,
  'com.attraccess.companion.plist',
);

function buildPlist(execPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>com.attraccess.companion</string>
\t<key>ProgramArguments</key>
\t<array>
\t\t<string>${execPath}</string>
\t</array>
\t<key>RunAtLoad</key>
\t<true/>
\t<key>KeepAlive</key>
\t<true/>
</dict>
</plist>
`;
}

/**
 * Writes ~/Library/LaunchAgents/com.attraccess.companion.plist so the
 * companion app starts automatically on login.
 * No-op on non-macOS.
 */
export async function installLaunchAgent(execPath: string): Promise<void> {
  if (process.platform !== 'darwin') return;
  await fsp.mkdir(LAUNCH_AGENTS_DIR, { recursive: true });
  await fsp.writeFile(LAUNCH_AGENT_PLIST, buildPlist(execPath), 'utf-8');
}

/**
 * Returns true if the launchd agent plist has already been installed.
 */
export async function isLaunchAgentInstalled(): Promise<boolean> {
  try {
    await fsp.access(LAUNCH_AGENT_PLIST);
    return true;
  } catch {
    return false;
  }
}
