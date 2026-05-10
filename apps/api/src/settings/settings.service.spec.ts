// Unit tests for SettingsService metrics toggle read/write helpers
// FEATURE: Metrics — admin-controlled timing instrumentation toggles
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '@attraccess/database-entities';
import { SettingsService } from './settings.service';
import { SettingsStoreService } from './settings-store.service';
import { SmtpSettingsService } from './smtp-settings.service';
import {
  METRICS_KEYS,
  METRICS_PARENT,
  METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS,
  METRICS_TOGGLE_DEFAULTS,
  METRICS_TOGGLE_KEYS,
} from './constants';
import { METRICS_TOGGLE_INVALIDATOR } from './metrics-toggle-invalidator.token';

describe('SettingsService metrics toggles', () => {
  let service: SettingsService;
  let store: { getPlainSetting: jest.Mock; setPlainSetting: jest.Mock };
  let invalidator: { refresh: jest.Mock };

  beforeEach(async () => {
    store = {
      getPlainSetting: jest.fn().mockResolvedValue(null),
      setPlainSetting: jest.fn().mockResolvedValue(undefined),
    };
    invalidator = { refresh: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: SettingsStoreService, useValue: store },
        { provide: SmtpSettingsService, useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: METRICS_TOGGLE_INVALIDATOR, useValue: invalidator },
      ],
    }).compile();

    service = moduleRef.get(SettingsService);
  });

  describe('getMetricsToggles', () => {
    it('returns defaults when no values are stored', async () => {
      const toggles = await service.getMetricsToggles();
      expect(toggles).toEqual(METRICS_TOGGLE_DEFAULTS);
    });

    it('returns stored true/false strings parsed correctly', async () => {
      store.getPlainSetting.mockImplementation(async (parent: string, key: string) => {
        if (parent !== METRICS_PARENT) return null;
        if (key === METRICS_TOGGLE_KEYS.http) return 'false';
        if (key === METRICS_TOGGLE_KEYS.db) return 'true';
        return null;
      });

      const toggles = await service.getMetricsToggles();

      expect(toggles.http).toBe(false);
      expect(toggles.db).toBe(true);
      expect(toggles.ws).toBe(METRICS_TOGGLE_DEFAULTS.ws);
    });
  });

  describe('updateMetricsToggles', () => {
    it('writes only provided keys and skips undefined', async () => {
      await service.updateMetricsToggles({ db: true });

      expect(store.setPlainSetting).toHaveBeenCalledTimes(1);
      expect(store.setPlainSetting).toHaveBeenCalledWith(METRICS_PARENT, METRICS_TOGGLE_KEYS.db, 'true');
    });

    it('writes false explicitly when value is false', async () => {
      await service.updateMetricsToggles({ http: false });

      expect(store.setPlainSetting).toHaveBeenCalledWith(METRICS_PARENT, METRICS_TOGGLE_KEYS.http, 'false');
    });

    it('invokes the toggle invalidator after writes', async () => {
      await service.updateMetricsToggles({ ws: false });

      expect(invalidator.refresh).toHaveBeenCalledTimes(1);
    });

    it('returns the freshly read toggles after writing', async () => {
      const stored: Record<string, string | null> = {};
      store.setPlainSetting.mockImplementation(async (_parent: string, key: string, value: string) => {
        stored[key] = value;
      });
      store.getPlainSetting.mockImplementation(async (_parent: string, key: string) => stored[key] ?? null);

      const result = await service.updateMetricsToggles({ db: true });

      expect(result.db).toBe(true);
    });
  });

  describe('slow query threshold', () => {
    it('returns the default when no value is stored', async () => {
      store.getPlainSetting.mockResolvedValue(null);

      await expect(service.getMetricsSlowQueryThresholdSeconds()).resolves.toBe(
        METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS,
      );
    });

    it('parses the stored numeric string', async () => {
      store.getPlainSetting.mockImplementation(async (_parent: string, key: string) =>
        key === METRICS_KEYS.slowQueryThresholdSeconds ? '1.5' : null,
      );

      await expect(service.getMetricsSlowQueryThresholdSeconds()).resolves.toBe(1.5);
    });

    it('falls back to default for invalid stored values', async () => {
      store.getPlainSetting.mockImplementation(async (_parent: string, key: string) =>
        key === METRICS_KEYS.slowQueryThresholdSeconds ? 'not-a-number' : null,
      );

      await expect(service.getMetricsSlowQueryThresholdSeconds()).resolves.toBe(
        METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS,
      );
    });

    it('writes the threshold and refreshes the toggle invalidator', async () => {
      await service.setMetricsSlowQueryThresholdSeconds(2);

      expect(store.setPlainSetting).toHaveBeenCalledWith(
        METRICS_PARENT,
        METRICS_KEYS.slowQueryThresholdSeconds,
        '2',
      );
      expect(invalidator.refresh).toHaveBeenCalledTimes(1);
    });
  });
});
