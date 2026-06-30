import { SystemMetricsAdapter } from './types';
import { WindowsMetricsAdapter } from './adapters/windows';
import { MacosMetricsAdapter } from './adapters/macos';
import { LinuxMetricsAdapter } from './adapters/linux';

export { SystemMetricsAdapter, ForegroundAppInfo, UsbDeviceInfo } from './types';
export { WindowsMetricsAdapter } from './adapters/windows';
export { MacosMetricsAdapter } from './adapters/macos';
export { LinuxMetricsAdapter } from './adapters/linux';

export function createMetricsAdapter(): SystemMetricsAdapter {
  switch (process.platform) {
    case 'win32':
      return new WindowsMetricsAdapter();
    case 'darwin':
      return new MacosMetricsAdapter();
    default:
      return new LinuxMetricsAdapter();
  }
}
