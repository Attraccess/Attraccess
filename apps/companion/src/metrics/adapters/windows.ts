import { exec } from 'child_process';
import { promisify } from 'util';
import { ForegroundAppInfo, SystemMetricsAdapter } from '../types';
import { startUsbWatcher } from '../usb-watcher';

const execAsync = promisify(exec);

const FOREGROUND_INTERVAL_MS = 500;

export class WindowsMetricsAdapter extends SystemMetricsAdapter {
  private foregroundTimer: ReturnType<typeof setInterval> | null = null;
  private usbStop: (() => void) | null = null;
  private lastForeground: ForegroundAppInfo | null = null;

  async start(): Promise<void> {
    // USB: libusb events via 'usb' package
    this.usbStop = startUsbWatcher(
      (d) => this.emit('usbDeviceAdded', d),
      (d) => this.emit('usbDeviceRemoved', d),
    );

    // Foreground: poll via PowerShell.
    // ponytail: Win32 SetWinEventHook needs a native message-pump; no scriptable event-based alternative.
    this.lastForeground = await this.queryForegroundApp();
    this.emit('foregroundAppChanged', this.lastForeground);

    this.foregroundTimer = setInterval(async () => {
      const current = await this.queryForegroundApp();
      if (!foregroundEqual(current, this.lastForeground)) {
        this.lastForeground = current;
        this.emit('foregroundAppChanged', current);
      }
    }, FOREGROUND_INTERVAL_MS);
  }

  stop(): void {
    if (this.foregroundTimer) clearInterval(this.foregroundTimer);
    this.foregroundTimer = null;
    this.usbStop?.();
    this.usbStop = null;
  }

  private async queryForegroundApp(): Promise<ForegroundAppInfo | null> {
    try {
      const script = [
        'Add-Type -TypeDefinition \'',
        'using System;',
        'using System.Runtime.InteropServices;',
        'public class Win32 {',
        '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
        '  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);',
        '}\'',
        '$hwnd = [Win32]::GetForegroundWindow()',
        '$pid = 0',
        '[Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null',
        '$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue',
        'if ($proc) { Write-Output "$($proc.Id)|$($proc.ProcessName)" }',
      ].join('\n');

      const { stdout } = await execAsync(
        `powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`,
        { timeout: 5000 }
      );

      const line = stdout.trim();
      if (!line) return null;
      const [pidStr, name] = line.split('|');
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) return null;
      return { pid, name };
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
