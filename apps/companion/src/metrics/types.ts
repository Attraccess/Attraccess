import EventEmitter from 'events';

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

// Typed event overloads so consumers get correct types on .on() / .emit()
export abstract class SystemMetricsAdapter extends EventEmitter {
  /** Start watching; emits initial state immediately, then emits changes. */
  abstract start(): Promise<void>;
  /** Stop all internal watchers and timers. */
  abstract stop(): void;

  emit(event: 'foregroundAppChanged', app: ForegroundAppInfo | null): boolean;
  emit(event: 'usbDeviceAdded', device: UsbDeviceInfo): boolean;
  emit(event: 'usbDeviceRemoved', device: UsbDeviceInfo): boolean;
  emit(event: string | symbol, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  on(event: 'foregroundAppChanged', listener: (app: ForegroundAppInfo | null) => void): this;
  on(event: 'usbDeviceAdded', listener: (device: UsbDeviceInfo) => void): this;
  on(event: 'usbDeviceRemoved', listener: (device: UsbDeviceInfo) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  off(event: 'foregroundAppChanged', listener: (app: ForegroundAppInfo | null) => void): this;
  off(event: 'usbDeviceAdded', listener: (device: UsbDeviceInfo) => void): this;
  off(event: 'usbDeviceRemoved', listener: (device: UsbDeviceInfo) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }
}
