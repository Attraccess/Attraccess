import { exec } from 'child_process';
import { promisify } from 'util';
import { ForegroundAppInfo, SystemMetricsAdapter, UsbDeviceInfo } from '../types';

const execAsync = promisify(exec);

export class MacosMetricsAdapter implements SystemMetricsAdapter {
  async getForegroundApp(): Promise<ForegroundAppInfo | null> {
    try {
      const { stdout } = await execAsync(
        'osascript -e \'tell application "System Events" to get {unix id, name, bundle identifier} of first application process whose frontmost is true\'',
        { timeout: 5000 }
      );

      // Output: "1234, Google Chrome, com.google.Chrome"
      const parts = stdout.trim().split(', ');
      if (parts.length < 2) return null;
      const pid = parseInt(parts[0], 10);
      if (isNaN(pid)) return null;
      return {
        pid,
        name: parts[1],
        bundleId: parts[2] ?? undefined,
      };
    } catch {
      return null;
    }
  }

  async getUsbDevices(): Promise<UsbDeviceInfo[]> {
    try {
      const { stdout } = await execAsync(
        'system_profiler SPUSBDataType -json',
        { timeout: 10000 }
      );

      const data = JSON.parse(stdout) as { SPUSBDataType?: unknown[] };
      const devices: UsbDeviceInfo[] = [];
      this._walkUsb(data.SPUSBDataType ?? [], devices);
      return devices;
    } catch {
      return [];
    }
  }

  private _walkUsb(nodes: unknown[], out: UsbDeviceInfo[]): void {
    for (const node of nodes) {
      if (typeof node !== 'object' || node === null) continue;
      const n = node as Record<string, unknown>;

      const vendorIdStr = n['vendor_id'] as string | undefined;
      const productIdStr = n['product_id'] as string | undefined;
      if (vendorIdStr && productIdStr) {
        out.push({
          vendorId: parseInt(vendorIdStr, 16),
          productId: parseInt(productIdStr, 16),
          manufacturer: n['manufacturer'] as string | undefined,
          product: n['_name'] as string | undefined,
          serialNumber: n['serial_num'] as string | undefined,
        });
      }

      // Recurse into child hubs
      if (Array.isArray(n['_items'])) {
        this._walkUsb(n['_items'] as unknown[], out);
      }
    }
  }
}
