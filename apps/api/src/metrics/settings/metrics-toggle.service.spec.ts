// Unit tests for MetricsToggleService cached + async toggle reads per subsystem
// FEATURE: Metrics — runtime toggle reads from settings store
import { Test } from '@nestjs/testing';
import { MetricsToggleService } from './metrics-toggle.service';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { METRICS_PARENT, METRICS_TOGGLE_KEYS, MetricsSubsystem } from '../../settings/constants';

const SUBSYSTEMS = Object.keys(METRICS_TOGGLE_KEYS) as MetricsSubsystem[];

describe('MetricsToggleService', () => {
  let svc: MetricsToggleService;
  let store: { getPlainSetting: jest.Mock };

  beforeEach(async () => {
    store = { getPlainSetting: jest.fn().mockResolvedValue(null) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MetricsToggleService,
        { provide: SettingsStoreService, useValue: store },
      ],
    }).compile();
    svc = moduleRef.get(MetricsToggleService);
  });

  afterEach(() => {
    svc.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('isEnabledCached defaults before refresh', () => {
    it.each([
      ['http', true],
      ['ws', true],
      ['cron', true],
      ['db', false],
      ['external', true],
      ['sse', true],
      ['flow', true],
    ])('returns default for %s when no refresh has happened', (subsystem, expected) => {
      expect(svc.isEnabledCached(subsystem as MetricsSubsystem)).toBe(expected);
    });
  });

  describe('refresh', () => {
    it('reads each subsystem key once from the store', async () => {
      await svc.refresh();
      expect(store.getPlainSetting).toHaveBeenCalledTimes(SUBSYSTEMS.length);
      for (const subsystem of SUBSYSTEMS) {
        expect(store.getPlainSetting).toHaveBeenCalledWith(METRICS_PARENT, METRICS_TOGGLE_KEYS[subsystem]);
      }
    });

    it('updates the cache with values from the store', async () => {
      store.getPlainSetting.mockImplementation(async (_parent: string, key: string) => {
        if (key === METRICS_TOGGLE_KEYS.http) return 'false';
        if (key === METRICS_TOGGLE_KEYS.db) return 'true';
        return null;
      });
      await svc.refresh();
      expect(svc.isEnabledCached('http')).toBe(false);
      expect(svc.isEnabledCached('db')).toBe(true);
      expect(svc.isEnabledCached('ws')).toBe(true);
    });

    it('coalesces concurrent refreshes into a single store read per subsystem', async () => {
      let resolveStore: (() => void) | null = null;
      const pending = new Promise<void>((resolve) => {
        resolveStore = resolve;
      });
      store.getPlainSetting.mockImplementation(async () => {
        await pending;
        return null;
      });
      const refreshes = Promise.all([svc.refresh(), svc.refresh(), svc.refresh()]);
      resolveStore?.();
      await refreshes;
      expect(store.getPlainSetting).toHaveBeenCalledTimes(SUBSYSTEMS.length);
    });
  });

  describe('isEnabled async path', () => {
    it('refreshes then returns the cached value', async () => {
      store.getPlainSetting.mockImplementation(async (_parent: string, key: string) =>
        key === METRICS_TOGGLE_KEYS.http ? 'false' : 'true',
      );
      await expect(svc.isEnabled('http')).resolves.toBe(false);
      expect(store.getPlainSetting).toHaveBeenCalledWith(METRICS_PARENT, METRICS_TOGGLE_KEYS.http);
    });

    it('coalesces N parallel callers into 1 store read per subsystem', async () => {
      let resolveStore: (() => void) | null = null;
      const pending = new Promise<void>((resolve) => {
        resolveStore = resolve;
      });
      store.getPlainSetting.mockImplementation(async () => {
        await pending;
        return null;
      });
      const calls = Promise.all([
        svc.isEnabled('http'),
        svc.isEnabled('http'),
        svc.isEnabled('ws'),
        svc.isEnabled('db'),
        svc.isEnabled('external'),
      ]);
      resolveStore?.();
      await calls;
      expect(store.getPlainSetting).toHaveBeenCalledTimes(SUBSYSTEMS.length);
    });
  });

  describe('invalidate', () => {
    it('clears cached values so subsequent isEnabledCached falls back to defaults', async () => {
      store.getPlainSetting.mockImplementation(async (_parent: string, key: string) =>
        key === METRICS_TOGGLE_KEYS.http ? 'false' : 'true',
      );
      await svc.refresh();
      expect(svc.isEnabledCached('http')).toBe(false);

      svc.invalidate();

      expect(svc.isEnabledCached('http')).toBe(true);
      expect(svc.isEnabledCached('db')).toBe(false);
    });
  });

  describe('lifecycle', () => {
    it('onModuleInit refreshes the cache once and registers an interval that is unref-ed', async () => {
      jest.useFakeTimers();
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      await svc.onModuleInit();
      expect(store.getPlainSetting).toHaveBeenCalledTimes(SUBSYSTEMS.length);
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
      const timer = setIntervalSpy.mock.results[0].value as { unref?: () => void };
      expect(typeof timer.unref).toBe('function');
    });

    it('interval callback triggers refresh', async () => {
      jest.useFakeTimers();
      await svc.onModuleInit();
      store.getPlainSetting.mockClear();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
      expect(store.getPlainSetting).toHaveBeenCalledTimes(SUBSYSTEMS.length);
    });

    it('onModuleDestroy clears the interval', async () => {
      jest.useFakeTimers();
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      await svc.onModuleInit();
      svc.onModuleDestroy();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });
});
