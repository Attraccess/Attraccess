import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ForegroundAppInfo, SystemMetricsAdapter, UsbDeviceInfo } from '../types';

const execAsync = promisify(exec);

export class LinuxMetricsAdapter implements SystemMetricsAdapter {
  async getForegroundApp(): Promise<ForegroundAppInfo | null> {
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

  async getUsbDevices(): Promise<UsbDeviceInfo[]> {
    try {
      const busPath = '/sys/bus/usb/devices';
      const entries = await fs.readdir(busPath).catch(() => [] as string[]);
      const devices: UsbDeviceInfo[] = [];

      await Promise.all(
        entries.map(async (entry) => {
          const dir = path.join(busPath, entry);
          const [idVendor, idProduct, manufacturer, product, serial] = await Promise.all([
            fs.readFile(path.join(dir, 'idVendor'), 'utf8').catch(() => null),
            fs.readFile(path.join(dir, 'idProduct'), 'utf8').catch(() => null),
            fs.readFile(path.join(dir, 'manufacturer'), 'utf8').catch(() => null),
            fs.readFile(path.join(dir, 'product'), 'utf8').catch(() => null),
            fs.readFile(path.join(dir, 'serial'), 'utf8').catch(() => null),
          ]);

          if (!idVendor || !idProduct) return;
          devices.push({
            vendorId: parseInt(idVendor.trim(), 16),
            productId: parseInt(idProduct.trim(), 16),
            manufacturer: manufacturer?.trim(),
            product: product?.trim(),
            serialNumber: serial?.trim(),
          });
        })
      );

      return devices;
    } catch {
      return [];
    }
  }
}
