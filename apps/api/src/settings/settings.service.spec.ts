import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '@attraccess/database-entities';
import { SettingsService } from './settings.service';
import { SettingsStoreService } from './settings-store.service';
import { SmtpSettingsService } from './smtp-settings.service';
import {
  APP_PARENT,
  APP_KEYS,
  AUTH_PARENT,
  AUTH_KEYS,
  MESSAGING_PARENT,
  MESSAGING_KEYS,
  RATE_LIMIT_DEFAULTS,
  MESSAGING_RATE_LIMIT_DEFAULTS,
  METRICS_KEYS,
  METRICS_PARENT,
  METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS,
  METRICS_TOGGLE_DEFAULTS,
  METRICS_TOGGLE_KEYS,
} from './constants';
import { METRICS_TOGGLE_INVALIDATOR } from './metrics-toggle-invalidator.token';

describe('SettingsService', () => {
  let service: SettingsService;
  let store: { getPlainSetting: jest.Mock; setPlainSetting: jest.Mock; setSecretSetting: jest.Mock };
  let smtpSettings: { getSettings: jest.Mock };
  let userRepository: { count: jest.Mock };
  let invalidator: { refresh: jest.Mock };

  beforeEach(async () => {
    store = {
      getPlainSetting: jest.fn().mockResolvedValue(null),
      setPlainSetting: jest.fn().mockResolvedValue(undefined),
      setSecretSetting: jest.fn().mockResolvedValue(undefined),
    };
    smtpSettings = { getSettings: jest.fn() };
    userRepository = { count: jest.fn() };
    invalidator = { refresh: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: SettingsStoreService, useValue: store },
        { provide: SmtpSettingsService, useValue: smtpSettings },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: METRICS_TOGGLE_INVALIDATOR, useValue: invalidator },
      ],
    }).compile();

    service = moduleRef.get(SettingsService);
  });

  it('updates only supplied application settings and permits explicit clearing of stored secrets', async () => {
    await service.updateAppSettings({ url: 'https://workspace.test' });
    expect(store.setPlainSetting).toHaveBeenCalledTimes(1);
    expect(store.setPlainSetting).toHaveBeenCalledWith(APP_PARENT, APP_KEYS.url, 'https://workspace.test');
    expect(store.setSecretSetting).not.toHaveBeenCalled();
    await service.updateAppSettings({ url: null, publicInternetUrl: null, licenseKey: null });
    expect(store.setPlainSetting).toHaveBeenCalledWith(APP_PARENT, APP_KEYS.url, null);
    expect(store.setPlainSetting).toHaveBeenCalledWith(APP_PARENT, APP_KEYS.publicInternetUrl, null);
    expect(store.setSecretSetting).toHaveBeenCalledWith(APP_PARENT, APP_KEYS.licenseKey, null);
  });

  it('defaults existing readers to German, persists the selected language, and falls back to English for corrupt values', async () => {
    expect(await service.getAttractapLanguage()).toBe('de');
    await service.updateAppSettings({ attractapLanguage: 'en' });
    expect(store.setPlainSetting).toHaveBeenCalledWith(APP_PARENT, APP_KEYS.attractapLanguage, 'en');
    store.getPlainSetting.mockResolvedValue('unexpected');
    expect(await service.getAttractapLanguage()).toBe('en');
  });

  it('persists every authentication rate-limit option and returns the resolved policy', async () => {
    const values = new Map<string, string>();
    store.setPlainSetting.mockImplementation(async (parent, key, value) => {
      values.set(`${parent}:${key}`, value);
    });
    store.getPlainSetting.mockImplementation(async (parent, key) => values.get(`${parent}:${key}`) ?? null);
    const policy = {
      maxAttempts: 6,
      windowSeconds: 120,
      lockoutDurationSeconds: 300,
      exponentialBackoff: true,
      backoffMultiplier: 2.5,
    };
    expect(await service.updateAuthRateLimitSettings(policy)).toEqual(policy);
    expect(store.setPlainSetting).toHaveBeenCalledTimes(5);
    expect(store.setPlainSetting).toHaveBeenCalledWith(AUTH_PARENT, AUTH_KEYS.rateLimitExponentialBackoff, 'true');
    expect(await service.updateAuthRateLimitSettings({ exponentialBackoff: false })).toEqual({
      ...policy,
      exponentialBackoff: false,
    });
  });

  it.each([null, '', 'invalid', '0', '-2', 'Infinity'])(
    'falls back safely for invalid stored limits: %s',
    async (value) => {
      store.getPlainSetting.mockResolvedValue(value);
      expect(await service.getAuthRateLimitSettings()).toEqual(RATE_LIMIT_DEFAULTS);
      expect(await service.getMessagingRateLimitSettings()).toEqual(MESSAGING_RATE_LIMIT_DEFAULTS);
    },
  );

  it('stores message and contact limits independently without clearing omitted values', async () => {
    const values = new Map<string, string>();
    store.setPlainSetting.mockImplementation(async (parent, key, value) => {
      values.set(`${parent}:${key}`, value);
    });
    store.getPlainSetting.mockImplementation(async (parent, key) => values.get(`${parent}:${key}`) ?? null);
    const policy = { sendMaxPerWindow: 20, sendWindowSeconds: 60, contactMaxPerWindow: 8, contactWindowSeconds: 300 };
    expect(await service.updateMessagingRateLimitSettings(policy)).toEqual(policy);
    store.setPlainSetting.mockClear();
    expect(await service.updateMessagingRateLimitSettings({ contactMaxPerWindow: 4 })).toEqual({
      ...policy,
      contactMaxPerWindow: 4,
    });
    expect(store.setPlainSetting).toHaveBeenCalledTimes(1);
    expect(store.setPlainSetting).toHaveBeenCalledWith(MESSAGING_PARENT, MESSAGING_KEYS.contactRateLimitMax, '4');
  });

  describe('getFirstTimeSetupStatus', () => {
    it('marks unauthenticated SMTP as complete when its required settings are configured', async () => {
      jest.spyOn(service, 'getAppSettings').mockResolvedValue({
        url: 'https://attraccess.example',
        publicInternetUrl: null,
        licenseKeyConfigured: true,
      });
      smtpSettings.getSettings.mockResolvedValue({
        service: 'SMTP',
        host: 'smtp.example',
        port: 587,
        user: null,
        passConfigured: false,
        from: 'noreply@attraccess.example',
      });
      userRepository.count.mockResolvedValue(0);

      const status = await service.getFirstTimeSetupStatus();

      expect(status.stepsCompleted.smtp).toBe(true);
    });
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

      expect(store.setPlainSetting).toHaveBeenCalledWith(METRICS_PARENT, METRICS_KEYS.slowQueryThresholdSeconds, '2');
      expect(invalidator.refresh).toHaveBeenCalledTimes(1);
    });
  });
});
