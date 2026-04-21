import { Test } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController (metrics endpoints)', () => {
  let controller: SettingsController;
  let settingsService: jest.Mocked<
    Pick<SettingsService, 'getMetricsApiKey' | 'generateMetricsApiKey' | 'setMetricsApiKey'>
  >;

  beforeEach(async () => {
    settingsService = {
      getMetricsApiKey: jest.fn(),
      generateMetricsApiKey: jest.fn(),
      setMetricsApiKey: jest.fn(),
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

      expect(await controller.getMetricsSettings()).toEqual({ apiKeyConfigured: true });
    });

    it('returns apiKeyConfigured: false when no key exists', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: null, configured: false });

      expect(await controller.getMetricsSettings()).toEqual({ apiKeyConfigured: false });
    });

    it('does not leak the raw API key in the response', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: 'super-secret', configured: true });

      const result = await controller.getMetricsSettings();

      expect(Object.values(result)).not.toContain('super-secret');
      expect(result).not.toHaveProperty('apiKey');
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
    it('clears the key via setMetricsApiKey(null) and returns apiKeyConfigured: false', async () => {
      settingsService.setMetricsApiKey.mockResolvedValue(undefined as unknown as void);

      const result = await controller.deleteMetricsApiKey();

      expect(settingsService.setMetricsApiKey).toHaveBeenCalledWith(null);
      expect(result).toEqual({ apiKeyConfigured: false });
    });
  });
});
