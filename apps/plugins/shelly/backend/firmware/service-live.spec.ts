import { ShellyFirmwareService } from './service.service';
import { ShellyHttpClient } from '../communication/http-client';

describe('Shelly bundled firmware status', () => {
  it('shares device reads and releases sampling; operation credentials never appear in events and expire', async () => {
    jest.useFakeTimers();
    try {
      const http = { postJson: jest.fn(async () => ({})) } as unknown as ShellyHttpClient;
      const firmware = new ShellyFirmwareService(http);
      const status = {
        generation: 2,
        currentVersion: '1',
        available: { stable: '2', beta: null },
        hasUpdate: true,
        state: 'idle',
        fetchedAt: 'now',
      } as const;
      const get = jest.spyOn(firmware, 'getStatus').mockResolvedValue(status);
      await firmware.startUpdate(
        { ipAddress: '127.0.0.1', generation: 2, currentPassword: 'fixture-private-password' },
        'stable',
        1,
      );
      const resolve = jest.fn(async () => ({ ipAddress: '127.0.0.1', generation: 2 }));
      const first = jest.fn(),
        second = jest.fn();
      const a = firmware.observe(1, resolve).subscribe(first);
      const b = firmware.observe(1, resolve).subscribe(second);
      await jest.advanceTimersByTimeAsync(0);
      expect(get).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenLastCalledWith(expect.objectContaining({ currentPassword: 'fixture-private-password' }));
      expect(JSON.stringify(first.mock.calls)).not.toContain('fixture-private-password');
      a.unsubscribe();
      await jest.advanceTimersByTimeAsync(5_000);
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(2);
      b.unsubscribe();
      await jest.advanceTimersByTimeAsync(5 * 60_000);
      expect(get).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(0);
      const c = firmware.observe(1, resolve).subscribe();
      await jest.advanceTimersByTimeAsync(0);
      expect(get).toHaveBeenLastCalledWith({ ipAddress: '127.0.0.1', generation: 2 });
      c.unsubscribe();
      firmware.onModuleDestroy();
    } finally {
      jest.useRealTimers();
    }
  });
});
