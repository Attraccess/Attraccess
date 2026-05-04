import { Test } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { METRICS_TOGGLE_DEFAULTS } from './constants';

describe('SettingsController (metrics endpoints)', () => {
  let controller: SettingsController;
  let settingsService: jest.Mocked<
    Pick<
      SettingsService,
      | 'getMetricsApiKey'
      | 'generateMetricsApiKey'
      | 'setMetricsApiKey'
      | 'getMetricsToggles'
      | 'updateMetricsToggles'
    >
  >;

  beforeEach(async () => {
    settingsService = {
      getMetricsApiKey: jest.fn().mockResolvedValue({ value: null, configured: false }),
      generateMetricsApiKey: jest.fn(),
      setMetricsApiKey: jest.fn(),
      getMetricsToggles: jest.fn().mockResolvedValue({ ...METRICS_TOGGLE_DEFAULTS }),
      updateMetricsToggles: jest.fn().mockResolvedValue({ ...METRICS_TOGGLE_DEFAULTS }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: settingsService }],
    }).compile();

    controller = moduleRef.get(SettingsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET /settings/metrics', () => {
    it('returns apiKeyConfigured: true when a key exists', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: 'some-key', configured: true });

      const result = await controller.getMetricsSettings();

      expect(result.apiKeyConfigured).toBe(true);
      expect(result.toggles).toEqual(METRICS_TOGGLE_DEFAULTS);
    });

    it('returns apiKeyConfigured: false when no key exists', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: null, configured: false });

      const result = await controller.getMetricsSettings();

      expect(result.apiKeyConfigured).toBe(false);
      expect(result.toggles).toEqual(METRICS_TOGGLE_DEFAULTS);
    });

    it('does not leak the raw API key in the response', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: 'super-secret', configured: true });

      const result = await controller.getMetricsSettings();

      expect(Object.values(result)).not.toContain('super-secret');
      expect(result).not.toHaveProperty('apiKey');
    });

    it('includes all 7 toggle keys in the response', async () => {
      const result = await controller.getMetricsSettings();

      expect(Object.keys(result.toggles).sort()).toEqual(
        ['cron', 'db', 'external', 'flow', 'http', 'sse', 'ws'],
      );
    });
  });

  describe('PATCH /settings/metrics', () => {
    it('persists a single toggle update via updateMetricsToggles', async () => {
      const next = { ...METRICS_TOGGLE_DEFAULTS, db: true };
      settingsService.updateMetricsToggles.mockResolvedValue(next);
      settingsService.getMetricsToggles.mockResolvedValue(next);

      const result = await controller.updateMetricsSettings({ toggles: { db: true } });

      expect(settingsService.updateMetricsToggles).toHaveBeenCalledWith({ db: true });
      expect(result.toggles.db).toBe(true);
      expect(result.toggles.http).toBe(METRICS_TOGGLE_DEFAULTS.http);
    });

    it('skips writes when toggles is omitted', async () => {
      const result = await controller.updateMetricsSettings({});

      expect(settingsService.updateMetricsToggles).not.toHaveBeenCalled();
      expect(result.toggles).toEqual(METRICS_TOGGLE_DEFAULTS);
    });

    it('returns the latest apiKeyConfigured + toggles in the response shape', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: 'k', configured: true });
      settingsService.getMetricsToggles.mockResolvedValue(METRICS_TOGGLE_DEFAULTS);

      const result = await controller.updateMetricsSettings({ toggles: { http: true } });

      expect(result).toEqual({ apiKeyConfigured: true, toggles: METRICS_TOGGLE_DEFAULTS });
    });
  });

  describe('POST /settings/metrics/generate-api-key', () => {
    it('returns the newly generated key (one-time display) and apiKeyConfigured: true', async () => {
      settingsService.generateMetricsApiKey.mockResolvedValue({ apiKey: 'new-key-abc123' });

      const result = await controller.generateMetricsApiKey();

      expect(settingsService.generateMetricsApiKey).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ apiKeyConfigured: true, apiKey: 'new-key-abc123' });
    });

    it('propagates service errors to the caller', async () => {
      settingsService.generateMetricsApiKey.mockRejectedValue(new Error('storage failure'));

      await expect(controller.generateMetricsApiKey()).rejects.toThrow('storage failure');
    });
  });

  describe('DELETE /settings/metrics/api-key', () => {
    it('clears the key via setMetricsApiKey(null) and returns apiKeyConfigured: false with toggles', async () => {
      settingsService.setMetricsApiKey.mockResolvedValue(undefined as unknown as void);

      const result = await controller.deleteMetricsApiKey();

      expect(settingsService.setMetricsApiKey).toHaveBeenCalledWith(null);
      expect(result.apiKeyConfigured).toBe(false);
      expect(result.toggles).toEqual(METRICS_TOGGLE_DEFAULTS);
    });
  });
});
