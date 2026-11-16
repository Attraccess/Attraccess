import type { UsbDeviceInfo } from './types';

interface UsbDevice {
  vendorId: number;
  productId: number;
  manufacturerName: string | null;
  productName: string | null;
  serialNumber: string | null;
}

interface UsbConnectionEvent {
  device: UsbDevice;
}

// usb 3 replaced the legacy `on('attach')` emitter with WebUSB. Its `usb` export is a WebUSB
// instance that already allows every device, so connect/disconnect fire for any physical change.
type UsbLib = {
  usb: {
    addEventListener(type: 'connect' | 'disconnect', cb: (ev: UsbConnectionEvent) => void): void;
    removeEventListener(type: 'connect' | 'disconnect', cb: (ev: UsbConnectionEvent) => void): void;
  };
};

// ponytail: lazy require keeps the native usb module out of jest/test contexts, and the
// catch keeps a packaged build without the prebuilt binary from taking down the whole app —
// USB triggers just go silent instead.
export function startUsbWatcher(onAdd: (d: UsbDeviceInfo) => void, onRemove: (d: UsbDeviceInfo) => void): () => void {
  let usb: UsbLib['usb'];
  try {
    usb = (require('usb') as UsbLib).usb;
  } catch (err) {
    console.warn('[usb] native module unavailable, USB device events disabled:', err);
    return () => undefined;
  }

  const toBasic = (d: UsbDevice): UsbDeviceInfo => ({ vendorId: d.vendorId, productId: d.productId });

  function toInfoWithStrings(d: UsbDevice): UsbDeviceInfo {
    const info = toBasic(d);
    try {
      if (d.manufacturerName) info.manufacturer = d.manufacturerName;
      if (d.productName) info.product = d.productName;
      if (d.serialNumber) info.serialNumber = d.serialNumber;
    } catch {
      // device busy, no permissions, or kernel driver conflict — string descriptors are optional
    }
    return info;
  }

  // ponytail: no initial getDevices() enumeration — "connected" means a physical attach event,
  // not "is currently plugged in". Emitting for all existing devices on every WS reconnect would
  // fire spurious triggers for devices that never moved.
  const onAttach = (ev: UsbConnectionEvent) => onAdd(toInfoWithStrings(ev.device));
  const onDetach = (ev: UsbConnectionEvent) => onRemove(toBasic(ev.device));

  usb.addEventListener('connect', onAttach);
  usb.addEventListener('disconnect', onDetach);

  return () => {
    usb.removeEventListener('connect', onAttach);
    usb.removeEventListener('disconnect', onDetach);
  };
}
