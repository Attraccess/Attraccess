import { startUsbWatcher, type UsbLib } from './usb-watcher';
const usb = { addEventListener: jest.fn(), removeEventListener: jest.fn(), isPotentialSystemDevice: jest.fn() };
const WebUSB = jest.fn(() => usb);
jest.mock('usb', () => ({ WebUSB }), { virtual: true });
const listener = (name: string) => usb.addEventListener.mock.calls.find(([type]) => type === name)?.[1];
const device = {
  vendorId: 1234,
  productId: 5678,
  manufacturerName: 'Vendor',
  productName: 'Reader',
  serialNumber: 'serial-7',
};
beforeEach(() => {
  jest.clearAllMocks();
});
it('reports devices that usb 3 WebUSB hides as potential system devices', () => {
  const real = jest.requireActual('usb') as { WebUSB: new (options: object) => EventTarget };
  let target: { deviceConnectCallback(d: object): Promise<void> } | undefined;
  // Keep listeners in JS: the real addEventListener would start native hotplug monitoring.
  class Recording extends real.WebUSB {
    constructor(options: object) {
      super(options);
      target = this as unknown as typeof target;
    }
    override addEventListener(type: string, cb: EventListener) {
      EventTarget.prototype.addEventListener.call(this, type, cb);
    }
    override removeEventListener(type: string, cb: EventListener) {
      EventTarget.prototype.removeEventListener.call(this, type, cb);
    }
  }
  const add = jest.fn();
  const stop = startUsbWatcher(add, jest.fn(), () => ({ WebUSB: Recording }) as unknown as UsbLib);
  const hid = { ...device, handle: 'h1', deviceClass: 0x03 };
  if (!target) throw new Error('WebUSB was not constructed');
  return target.deviceConnectCallback(hid).then(() => {
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ vendorId: 1234, productId: 5678 }));
    stop();
  });
});
it('emits physical connect/disconnect events with optional strings and unsubscribes on stop', () => {
  const add = jest.fn(),
    remove = jest.fn();
  const stop = startUsbWatcher(add, remove);
  expect(add).not.toHaveBeenCalled();
  const attach = listener('connect');
  const detach = listener('disconnect');
  attach({ device });
  expect(add).toHaveBeenCalledWith({
    vendorId: 1234,
    productId: 5678,
    manufacturer: 'Vendor',
    product: 'Reader',
    serialNumber: 'serial-7',
  });
  detach({ device });
  expect(remove).toHaveBeenCalledWith({ vendorId: 1234, productId: 5678 });
  expect(WebUSB).toHaveBeenCalledWith({ allowAllDevices: true });
  stop();
  expect(usb.removeEventListener).toHaveBeenCalledWith('connect', attach);
  expect(usb.removeEventListener).toHaveBeenCalledWith('disconnect', detach);
});
it('retains basic identity when descriptor access fails or descriptors are absent', () => {
  const add = jest.fn();
  startUsbWatcher(add, jest.fn());
  const attach = listener('connect');
  attach({
    device: {
      vendorId: 1234,
      productId: 5678,
      get manufacturerName(): string {
        throw new Error('Busy');
      },
    },
  });
  expect(add).toHaveBeenLastCalledWith({ vendorId: 1234, productId: 5678 });
  attach({
    device: { vendorId: 1234, productId: 5678, manufacturerName: null, productName: null, serialNumber: null },
  });
  expect(add).toHaveBeenCalledTimes(2);
  expect(add).toHaveBeenLastCalledWith({ vendorId: 1234, productId: 5678 });
});
