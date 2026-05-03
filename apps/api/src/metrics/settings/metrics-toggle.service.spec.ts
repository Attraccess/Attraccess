// Unit tests for MetricsToggleService.isEnabled() per subsystem
// FEATURE: Metrics — runtime toggle reads from settings store
import { Test } from '@nestjs/testing';
import { MetricsToggleService } from './metrics-toggle.service';
import { SettingsStoreService } from '../../settings/settings-store.service';

describe('MetricsToggleService', () => {
  let svc: MetricsToggleService;
  let store: { get: jest.Mock };

  beforeEach(async () => {
    store = { get: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MetricsToggleService,
        { provide: SettingsStoreService, useValue: store },
      ],
    }).compile();
    svc = moduleRef.get(MetricsToggleService);
  });

  it.each([
    ['http', 'metrics_http_enabled', true],
    ['ws', 'metrics_ws_enabled', true],
    ['cron', 'metrics_cron_enabled', true],
    ['db', 'metrics_db_enabled', false],
    ['external', 'metrics_external_enabled', true],
    ['sse', 'metrics_sse_enabled', true],
    ['flow', 'metrics_flow_enabled', true],
  ])('returns DB value for %s', async (subsystem, key, value) => {
    store.get.mockResolvedValueOnce(String(value));
    await expect(svc.isEnabled(subsystem as never)).resolves.toBe(value);
    expect(store.get).toHaveBeenCalledWith(key);
  });

  it('falls back to true when setting is missing for non-db subsystems', async () => {
    store.get.mockResolvedValueOnce(null);
    await expect(svc.isEnabled('http')).resolves.toBe(true);
  });

  it('falls back to false for db subsystem when missing', async () => {
    store.get.mockResolvedValueOnce(null);
    await expect(svc.isEnabled('db')).resolves.toBe(false);
  });

  it('caches values for 5 seconds', async () => {
    store.get.mockResolvedValue('true');
    await svc.isEnabled('http');
    await svc.isEnabled('http');
    expect(store.get).toHaveBeenCalledTimes(1);
  });
});
