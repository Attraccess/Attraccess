import type { UsbDeviceInfo } from './types';

interface UsbDeviceDescriptor {
  idVendor: number;
  idProduct: number;
  iManufacturer: number;
  iProduct: number;
  iSerialNumber: number;
}

interface UsbDevice {
  deviceDescriptor: UsbDeviceDescriptor;
  open(): void;
  close(): void;
  getStringDescriptor(index: number, cb: (err: Error | null, val?: string) => void): void;
}

type UsbLib = {
  on(event: 'attach' | 'detach', cb: (d: UsbDevice) => void): void;
  off(event: 'attach' | 'detach', cb: (d: UsbDevice) => void): void;
};

// ponytail: lazy require keeps the native usb module out of jest/test contexts, and the
// catch keeps a packaged build without the prebuilt binary from taking down the whole app —
// USB triggers just go silent instead.
export function startUsbWatcher(
  onAdd: (d: UsbDeviceInfo) => void,
  onRemove: (d: UsbDeviceInfo) => void,
): () => void {
  let lib: UsbLib;
  try {
    lib = require('usb') as UsbLib;
  } catch (err) {
    console.warn('[usb] native module unavailable, USB device events disabled:', err);
    return () => undefined;
  }

  const toBasic = (d: UsbDevice): UsbDeviceInfo => ({
    vendorId: d.deviceDescriptor.idVendor,
    productId: d.deviceDescriptor.idProduct,
  });

  async function toInfoWithStrings(d: UsbDevice): Promise<UsbDeviceInfo> {
    const info = toBasic(d);
    try {
      d.open();
      const readStr = (idx: number): Promise<string | undefined> =>
        idx === 0
          ? Promise.resolve(undefined)
          : new Promise((resolve) =>
              d.getStringDescriptor(idx, (err, val) => resolve(err || !val ? undefined : val))
            );
      const [manufacturer, product, serialNumber] = await Promise.all([
        readStr(d.deviceDescriptor.iManufacturer),
        readStr(d.deviceDescriptor.iProduct),
        readStr(d.deviceDescriptor.iSerialNumber),
      ]);
      if (manufacturer) info.manufacturer = manufacturer;
      if (product) info.product = product;
      if (serialNumber) info.serialNumber = serialNumber;
      d.close();
    } catch {
      // device busy, no permissions, or kernel driver conflict — string descriptors are optional
    }
    return info;
  }

  // ponytail: no initial getDeviceList() enumeration — "connected" means a physical attach event,
  // not "is currently plugged in". Emitting for all existing devices on every WS reconnect would
  // fire spurious triggers for devices that never moved.
  const onAttach = (d: UsbDevice) => {
    toInfoWithStrings(d).then(onAdd).catch(() => onAdd(toBasic(d)));
  };
  const onDetach = (d: UsbDevice) => onRemove(toBasic(d));

  lib.on('attach', onAttach);
  lib.on('detach', onDetach);

  return () => {
    lib.off('attach', onAttach);
    lib.off('detach', onDetach);
  };
}
