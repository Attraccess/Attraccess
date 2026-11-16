import { startUsbWatcher } from './usb-watcher';
jest.mock('usb', () => ({ usb: { addEventListener: jest.fn(), removeEventListener: jest.fn() } }), { virtual: true });
const { usb } = jest.requireMock('usb') as { usb: { addEventListener: jest.Mock; removeEventListener: jest.Mock } };
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
it('listens on the WebUSB object that usb 3 exports', () => {
  const real = jest.requireActual('usb') as { usb: EventTarget };
  expect(typeof real.usb.addEventListener).toBe('function');
  expect(typeof real.usb.removeEventListener).toBe('function');
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
