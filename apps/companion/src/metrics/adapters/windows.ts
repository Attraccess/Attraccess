import { exec } from 'child_process';
import { promisify } from 'util';
import { ForegroundAppInfo, SystemMetricsAdapter, UsbDeviceInfo } from '../types';

const execAsync = promisify(exec);

export class WindowsMetricsAdapter implements SystemMetricsAdapter {
  async getForegroundApp(): Promise<ForegroundAppInfo | null> {
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

  async getUsbDevices(): Promise<UsbDeviceInfo[]> {
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -NonInteractive -Command "Get-PnpDevice -Class USB -Status OK | Select-Object -ExpandProperty InstanceId"',
        { timeout: 5000 }
      );

      // PowerShell USB enumeration gives instance IDs like USB\VID_1234&PID_5678\...
      const devices: UsbDeviceInfo[] = [];
      for (const line of stdout.split('\n')) {
        const match = line.match(/VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i);
        if (match) {
          devices.push({
            vendorId: parseInt(match[1], 16),
            productId: parseInt(match[2], 16),
          });
        }
      }
      return devices;
    } catch {
      return [];
    }
  }
}
