import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import type { ChildProcess } from 'child_process';
import { ForegroundAppInfo, SystemMetricsAdapter } from '../types';
import { startUsbWatcher } from '../usb-watcher';

const execAsync = promisify(exec);

export class LinuxMetricsAdapter extends SystemMetricsAdapter {
  private foregroundProc: ChildProcess | null = null;
  private usbStop: (() => void) | null = null;
  private lastForeground: ForegroundAppInfo | null = null;

  async start(): Promise<void> {
    // USB: libusb events via 'usb' package
    this.usbStop = startUsbWatcher(
      (d) => this.emit('usbDeviceAdded', d),
      (d) => this.emit('usbDeviceRemoved', d),
    );

    // Foreground: emit initial state, then watch via xprop -spy
    this.lastForeground = await this.queryForeground();
    this.emit('foregroundAppChanged', this.lastForeground);

    this.foregroundProc = spawn('xprop', ['-spy', '-root', '_NET_ACTIVE_WINDOW'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    let buf = '';
    this.foregroundProc.stdout?.setEncoding('utf8');
    this.foregroundProc.stdout?.on('data', (chunk: string) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.includes('_NET_ACTIVE_WINDOW')) void this.handleXpropLine(line);
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this.foregroundProc.on('error', () => {}); // xprop unavailable — no foreground events
  }

  stop(): void {
    this.foregroundProc?.kill();
    this.foregroundProc = null;
    this.usbStop?.();
    this.usbStop = null;
  }

  private async handleXpropLine(line: string): Promise<void> {
    // output: "_NET_ACTIVE_WINDOW(WINDOW): window id # 0x1234abc, 0x0"
    //     or: "_NET_ACTIVE_WINDOW(WINDOW): 0x0"
    const match = line.match(/window id # (0x[0-9a-f]+)/i);
    const app = match ? await this.resolveWindow(match[1]) : null;
    if (!foregroundEqual(app, this.lastForeground)) {
      this.lastForeground = app;
      this.emit('foregroundAppChanged', app);
    }
  }

  private async resolveWindow(wid: string): Promise<ForegroundAppInfo | null> {
    try {
      const { stdout } = await execAsync(`xdotool getwindowpid ${wid}`, { timeout: 2000 });
      const pid = parseInt(stdout.trim(), 10);
      if (isNaN(pid)) return null;
      const comm = await fs.readFile(`/proc/${pid}/comm`, 'utf8').catch(() => null);
      if (!comm) return null;
      return { pid, name: comm.trim() };
    } catch {
      return null;
    }
  }

  private async queryForeground(): Promise<ForegroundAppInfo | null> {
    try {
      const { stdout } = await execAsync('xdotool getactivewindow getwindowpid', { timeout: 5000 });
      const pid = parseInt(stdout.trim(), 10);
      if (isNaN(pid)) return null;
      const comm = await fs.readFile(`/proc/${pid}/comm`, 'utf8').catch(() => null);
      if (!comm) return null;
      return { pid, name: comm.trim() };
    } catch {
      return null;
    }
  }
}

function foregroundEqual(a: ForegroundAppInfo | null, b: ForegroundAppInfo | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.pid === b.pid && a.name === b.name;
}
