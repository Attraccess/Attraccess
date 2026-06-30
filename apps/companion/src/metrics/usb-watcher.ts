import type { UsbDeviceInfo } from './types';

// ponytail: lazy require keeps the native usb module out of jest/test contexts
export function startUsbWatcher(
  onAdd: (d: UsbDeviceInfo) => void,
  onRemove: (d: UsbDeviceInfo) => void,
): () => void {
  const lib = require('usb') as {
    getDeviceList(): { deviceDescriptor: { idVendor: number; idProduct: number } }[];
    on(event: 'attach' | 'detach', cb: (d: { deviceDescriptor: { idVendor: number; idProduct: number } }) => void): void;
    off(event: 'attach' | 'detach', cb: (d: { deviceDescriptor: { idVendor: number; idProduct: number } }) => void): void;
  };

  const toInfo = (d: { deviceDescriptor: { idVendor: number; idProduct: number } }): UsbDeviceInfo => ({
    vendorId: d.deviceDescriptor.idVendor,
    productId: d.deviceDescriptor.idProduct,
  });

  for (const d of lib.getDeviceList()) onAdd(toInfo(d));

  const onAttach = (d: { deviceDescriptor: { idVendor: number; idProduct: number } }) => onAdd(toInfo(d));
  const onDetach = (d: { deviceDescriptor: { idVendor: number; idProduct: number } }) => onRemove(toInfo(d));

  lib.on('attach', onAttach);
  lib.on('detach', onDetach);

  return () => {
    lib.off('attach', onAttach);
    lib.off('detach', onDetach);
  };
}
