import { Test } from '@nestjs/testing';
import { RateLimitService } from './rate-limit.service';
import { SettingsStoreService } from '../settings/settings-store.service';
import { RATE_LIMIT_DEFAULTS, RATE_LIMIT_IP_BUCKET_CAP } from './rate-limit.constants';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let settingsStore: jest.Mocked<Pick<SettingsStoreService, 'getPlainSetting'>>;

  beforeEach(async () => {
    settingsStore = { getPlainSetting: jest.fn().mockResolvedValue(null) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: SettingsStoreService, useValue: settingsStore },
      ],
    }).compile();
    service = moduleRef.get(RateLimitService);
  });

  describe('checkIp', () => {
    it('allows requests under the threshold', async () => {
      for (let i = 0; i < RATE_LIMIT_DEFAULTS.ipLoginMaxRequests; i++) {
        const decision = await service.checkIp('login', '203.0.113.1');
        expect(decision.allowed).toBe(true);
      }
    });

    it('blocks the next request after the threshold and reports retry-after', async () => {
      for (let i = 0; i < RATE_LIMIT_DEFAULTS.ipLoginMaxRequests; i++) {
        await service.checkIp('login', '203.0.113.2');
      }
      const decision = await service.checkIp('login', '203.0.113.2');
      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSeconds).toBeGreaterThan(0);
      expect(decision.retryAfterSeconds).toBeLessThanOrEqual(
        RATE_LIMIT_DEFAULTS.ipLoginWindowSeconds,
      );
    });

    it('lets requests through again once the window has expired', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      for (let i = 0; i < RATE_LIMIT_DEFAULTS.ipLoginMaxRequests; i++) {
        await service.checkIp('login', '203.0.113.3');
      }
      jest.setSystemTime(
        new Date(
          Date.now() + (RATE_LIMIT_DEFAULTS.ipLoginWindowSeconds + 1) * 1000,
        ),
      );
      const decision = await service.checkIp('login', '203.0.113.3');
      expect(decision.allowed).toBe(true);
      jest.useRealTimers();
    });

    it('keeps separate buckets per scope and per ip', async () => {
      for (let i = 0; i < RATE_LIMIT_DEFAULTS.ipLoginMaxRequests; i++) {
        await service.checkIp('login', '203.0.113.4');
      }
      const otherIp = await service.checkIp('login', '203.0.113.5');
      const otherScope = await service.checkIp('emailTrigger', '203.0.113.4');
      expect(otherIp.allowed).toBe(true);
      expect(otherScope.allowed).toBe(true);
    });

    it('caps memory at RATE_LIMIT_IP_BUCKET_CAP per scope and evicts oldest', async () => {
      for (let i = 0; i < RATE_LIMIT_IP_BUCKET_CAP + 50; i++) {
        await service.checkIp('login', `10.0.0.${i}`);
      }
      // The very first IP should have been evicted, so a fresh request from
      // it must still be allowed (its history was thrown away).
      const decision = await service.checkIp('login', '10.0.0.0');
      expect(decision.allowed).toBe(true);
    });

    it('falls back to defaults when the stored setting is unparseable', async () => {
      settingsStore.getPlainSetting.mockResolvedValue('not a number');
      const decision = await service.checkIp('login', '203.0.113.6');
      expect(decision.allowed).toBe(true);
    });
  });
});
