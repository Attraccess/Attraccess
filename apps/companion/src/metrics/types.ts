export interface ForegroundAppInfo {
  name: string;
  bundleId?: string; // macOS only
  pid: number;
}

export interface UsbDeviceInfo {
  vendorId: number;
  productId: number;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
}

export interface SystemMetricsAdapter {
  getForegroundApp(): Promise<ForegroundAppInfo | null>;
  getUsbDevices(): Promise<UsbDeviceInfo[]>;
}
