import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { ChildProcess } from 'child_process';
import { ForegroundAppInfo, SystemMetricsAdapter } from '../types';
import { startUsbWatcher } from '../usb-watcher';

// Writes a Swift script to tmp and returns the path.
// The script subscribes to NSWorkspace.didActivateApplicationNotification and prints
// "pid|name|bundleId" to stdout on every foreground-app change, plus the initial app.
function writeForegroundScript(): string {
  const script = `
import AppKit
import Foundation

NSWorkspace.shared.notificationCenter.addObserver(
    forName: NSWorkspace.didActivateApplicationNotification,
    object: nil,
    queue: nil
) { notification in
    if let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication {
        print("\\(app.processIdentifier)|\\(app.localizedName ?? "")|\\(app.bundleIdentifier ?? "")")
        fflush(stdout)
    }
}
if let front = NSWorkspace.shared.frontmostApplication {
    print("\\(front.processIdentifier)|\\(front.localizedName ?? "")|\\(front.bundleIdentifier ?? "")")
    fflush(stdout)
}
RunLoop.main.run()
`;
  const scriptPath = path.join(os.tmpdir(), 'attraccess-companion-foreground.swift');
  fs.writeFileSync(scriptPath, script, 'utf8');
  return scriptPath;
}

export class MacosMetricsAdapter extends SystemMetricsAdapter {
  private foregroundProc: ChildProcess | null = null;
  private usbStop: (() => void) | null = null;
  private lastForeground: ForegroundAppInfo | null = null;

  async start(): Promise<void> {
    // USB: libusb events via 'usb' package
    this.usbStop = startUsbWatcher(
      (d) => this.emit('usbDeviceAdded', d),
      (d) => this.emit('usbDeviceRemoved', d),
    );

    // Foreground: NSWorkspace.didActivateApplicationNotification via Swift subprocess.
    // Falls back silently if 'swift' CLI is not available.
    const scriptPath = writeForegroundScript();
    this.foregroundProc = spawn('swift', [scriptPath], { stdio: ['ignore', 'pipe', 'ignore'] });

    let buf = '';
    this.foregroundProc.stdout?.setEncoding('utf8');
    this.foregroundProc.stdout?.on('data', (chunk: string) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const app = parseForegroundLine(line);
        if (!foregroundEqual(app, this.lastForeground)) {
          this.lastForeground = app;
          this.emit('foregroundAppChanged', app);
        }
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this.foregroundProc.on('error', () => {}); // swift unavailable — no foreground events
  }

  stop(): void {
    this.foregroundProc?.kill();
    this.foregroundProc = null;
    this.usbStop?.();
    this.usbStop = null;
  }
}

function parseForegroundLine(line: string): ForegroundAppInfo | null {
  const [pidStr, name, bundleId] = line.split('|');
  const pid = parseInt(pidStr, 10);
  if (isNaN(pid)) return null;
  return { pid, name: name ?? '', bundleId: bundleId || undefined };
}

function foregroundEqual(a: ForegroundAppInfo | null, b: ForegroundAppInfo | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.pid === b.pid && a.name === b.name;
}
