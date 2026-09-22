import { EventEmitter } from 'events';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import { startUsbWatcher } from '../usb-watcher';
import { LinuxMetricsAdapter } from './linux';
import { MacosMetricsAdapter } from './macos';
import { WindowsMetricsAdapter } from './windows';
jest.mock('child_process', () => ({
  exec: Object.assign(jest.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: jest.fn() }),
  spawn: jest.fn(),
}));
jest.mock('fs/promises', () => ({ readFile: jest.fn() }));
jest.mock('fs', () => ({ writeFileSync: jest.fn() }));
jest.mock('../usb-watcher', () => ({ startUsbWatcher: jest.fn() }));
const execute = promisify(exec) as jest.Mock;
const stopUsb = jest.fn();
function processFixture() {
  const child = Object.assign(new EventEmitter(), {
    stdout: Object.assign(new EventEmitter(), { setEncoding: jest.fn() }),
    kill: jest.fn(),
  });
  jest.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  return child;
}
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(startUsbWatcher).mockReturnValue(stopUsb);
});
afterEach(() => jest.useRealTimers());
it('buffers macOS foreground lines, deduplicates app changes, and releases native observers', async () => {
  const child = processFixture();
  const adapter = new MacosMetricsAdapter(),
    changed = jest.fn(),
    added = jest.fn();
  adapter.on('foregroundAppChanged', changed);
  adapter.on('usbDeviceAdded', added);
  await adapter.start();
  child.stdout.emit('data', '\n12|Editor|com.fixture.edi');
  expect(changed).not.toHaveBeenCalled();
  child.stdout.emit('data', 'tor\n12|Editor|com.fixture.editor\n13|Browser|com.fixture.browser\ninvalid\ninvalid\n');
  expect(changed.mock.calls.map(([app]) => app)).toEqual([
    { pid: 12, name: 'Editor', bundleId: 'com.fixture.editor' },
    { pid: 13, name: 'Browser', bundleId: 'com.fixture.browser' },
    null,
  ]);
  jest.mocked(startUsbWatcher).mock.calls[0][0]({ vendorId: 1, productId: 2 });
  expect(added).toHaveBeenCalledWith({ vendorId: 1, productId: 2 });
  adapter.stop();
  expect(child.kill).toHaveBeenCalledTimes(1);
  expect(stopUsb).toHaveBeenCalledTimes(1);
});
it('resolves Linux foreground changes, ignores unrelated xprop output and emits loss once', async () => {
  const child = processFixture();
  execute.mockResolvedValue({ stdout: '12' });
  jest.mocked(fs.readFile).mockResolvedValue('editor\n');
  const adapter = new LinuxMetricsAdapter(),
    changed = jest.fn();
  adapter.on('foregroundAppChanged', changed);
  await adapter.start();
  child.stdout.emit('data', '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x123\n');
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(changed).toHaveBeenCalledTimes(1);
  execute.mockResolvedValue({ stdout: '13' });
  jest.mocked(fs.readFile).mockResolvedValue('browser\n');
  child.stdout.emit('data', 'irrelevant\n_NET_ACTIVE_WINDOW(WINDOW): window id # 0x456\n');
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(changed).toHaveBeenLastCalledWith({ pid: 13, name: 'browser' });
  child.stdout.emit('data', '_NET_ACTIVE_WINDOW(WINDOW): 0x0\n_NET_ACTIVE_WINDOW(WINDOW): 0x0\n');
  expect(changed).toHaveBeenCalledTimes(3);
  expect(changed).toHaveBeenLastCalledWith(null);
  adapter.stop();
  expect(child.kill).toHaveBeenCalledTimes(1);
  expect(stopUsb).toHaveBeenCalledTimes(1);
});
it('polls Windows foreground changes without duplicate events and stops polling on shutdown', async () => {
  jest.useFakeTimers();
  execute.mockResolvedValue({ stdout: '12|editor' });
  const adapter = new WindowsMetricsAdapter(),
    changed = jest.fn();
  adapter.on('foregroundAppChanged', changed);
  await adapter.start();
  await jest.advanceTimersByTimeAsync(1000);
  expect(changed).toHaveBeenCalledTimes(1);
  execute.mockResolvedValue({ stdout: '13|browser' });
  await jest.advanceTimersByTimeAsync(500);
  expect(changed).toHaveBeenLastCalledWith({ pid: 13, name: 'browser' });
  execute.mockRejectedValue(new Error('Process exited'));
  await jest.advanceTimersByTimeAsync(1000);
  expect(changed).toHaveBeenCalledTimes(3);
  expect(changed).toHaveBeenLastCalledWith(null);
  adapter.stop();
  const calls = execute.mock.calls.length;
  await jest.advanceTimersByTimeAsync(1000);
  expect(execute).toHaveBeenCalledTimes(calls);
  expect(stopUsb).toHaveBeenCalledTimes(1);
});
