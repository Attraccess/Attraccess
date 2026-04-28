// Behavioural tests for sliding-window IP rate limiter and memory cap
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

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

  describe('accountCooldown', () => {
    it('allows when there is no previous send', async () => {
      const decision = await service.accountCooldown('verifyResend', null);
      expect(decision.allowed).toBe(true);
      expect(decision.retryAfterSeconds).toBe(0);
    });

    it('blocks when the previous send was inside the cooldown window', async () => {
      const decision = await service.accountCooldown(
        'verifyResend',
        new Date(Date.now() - 5 * 1000),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('allows again once the cooldown has passed', async () => {
      const decision = await service.accountCooldown(
        'verifyResend',
        new Date(
          Date.now() -
            (RATE_LIMIT_DEFAULTS.accountVerifyResendCooldownSeconds + 1) * 1000,
        ),
      );
      expect(decision.allowed).toBe(true);
    });

    it('uses the password-reset cooldown for the passwordReset key', async () => {
      const decision = await service.accountCooldown(
        'passwordReset',
        new Date(Date.now() - 5 * 1000),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSeconds).toBeLessThanOrEqual(
        RATE_LIMIT_DEFAULTS.accountPasswordResetCooldownSeconds,
      );
    });
  });

  describe('login lock', () => {
    const baseUser = (overrides: Partial<{ failedLoginCount: number; loginLockedUntil: Date | null }> = {}) => ({
      failedLoginCount: 0,
      loginLockedUntil: null,
      ...overrides,
    });

    it('reports unlocked when no lock is set', async () => {
      const decision = await service.checkLoginLock(baseUser());
      expect(decision.allowed).toBe(true);
    });

    it('reports unlocked once the lock expiry has passed', async () => {
      const decision = await service.checkLoginLock(
        baseUser({ loginLockedUntil: new Date(Date.now() - 1000) }),
      );
      expect(decision.allowed).toBe(true);
    });

    it('reports locked when loginLockedUntil is in the future', async () => {
      const decision = await service.checkLoginLock(
        baseUser({ loginLockedUntil: new Date(Date.now() + 60_000) }),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('increments the counter and triggers a lock at the threshold', async () => {
      const user = baseUser({
        failedLoginCount: RATE_LIMIT_DEFAULTS.accountLoginMaxFailures - 1,
      });
      const result = await service.applyLoginFailure(user);
      expect(result.failedLoginCount).toBe(0);
      expect(result.loginLockedUntil).not.toBeNull();
      expect(
        (result.loginLockedUntil as Date).getTime() - Date.now(),
      ).toBeGreaterThan(0);
    });

    it('increments without locking when below threshold', async () => {
      const result = await service.applyLoginFailure(baseUser());
      expect(result.failedLoginCount).toBe(1);
      expect(result.loginLockedUntil).toBeNull();
    });

  });
});
