import { startUsbWatcher } from './usb-watcher';
jest.mock('usb', () => ({ on: jest.fn(), off: jest.fn() }), { virtual: true });
const usb = jest.requireMock('usb') as { on: jest.Mock; off: jest.Mock };
const descriptor = { idVendor: 1234, idProduct: 5678, iManufacturer: 1, iProduct: 2, iSerialNumber: 3 };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
beforeEach(() => {
  jest.clearAllMocks();
});
it('emits physical attach/detach events with optional strings and unsubscribes on stop', async () => {
  const add = jest.fn(),
    remove = jest.fn();
  const stop = startUsbWatcher(add, remove);
  expect(add).not.toHaveBeenCalled();
  const attach = usb.on.mock.calls.find(([name]) => name === 'attach')?.[1];
  const detach = usb.on.mock.calls.find(([name]) => name === 'detach')?.[1];
  const device = {
    deviceDescriptor: descriptor,
    open: jest.fn(),
    close: jest.fn(),
    getStringDescriptor: (id: number, done: (err: Error | null, value: string) => void) =>
      done(null, ['', 'Vendor', 'Reader', 'serial-7'][id]),
  };
  attach(device);
  await tick();
  expect(add).toHaveBeenCalledWith({
    vendorId: 1234,
    productId: 5678,
    manufacturer: 'Vendor',
    product: 'Reader',
    serialNumber: 'serial-7',
  });
  expect(device.close).toHaveBeenCalledTimes(1);
  detach(device);
  expect(remove).toHaveBeenCalledWith({ vendorId: 1234, productId: 5678 });
  stop();
  expect(usb.off).toHaveBeenCalledWith('attach', attach);
  expect(usb.off).toHaveBeenCalledWith('detach', detach);
});
it('retains basic identity when descriptor access fails or descriptors are absent', async () => {
  const add = jest.fn();
  startUsbWatcher(add, jest.fn());
  const attach = usb.on.mock.calls.find(([name]) => name === 'attach')?.[1];
  attach({
    deviceDescriptor: descriptor,
    open: () => {
      throw new Error('Busy');
    },
  });
  await tick();
  expect(add).toHaveBeenLastCalledWith({ vendorId: 1234, productId: 5678 });
  const device = {
    deviceDescriptor: { ...descriptor, iManufacturer: 0 },
    open: jest.fn(),
    close: jest.fn(),
    getStringDescriptor: (_id: number, done: (err: Error) => void) => done(new Error('Not available')),
  };
  attach(device);
  await tick();
  expect(add).toHaveBeenCalledTimes(2);
  expect(add).toHaveBeenLastCalledWith({ vendorId: 1234, productId: 5678 });
  expect(device.close).toHaveBeenCalledTimes(1);
});
