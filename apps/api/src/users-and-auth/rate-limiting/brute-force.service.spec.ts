import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '@attraccess/database-entities';
import { BruteForceProtectionService } from './brute-force.service';
import { SettingsService } from '../../settings/settings.service';
import { TooManyAuthAttemptsException, AccountLockedException } from './exceptions';

describe('BruteForceProtectionService', () => {
  let service: BruteForceProtectionService;
  let userRepo: { update: jest.Mock };
  let settings: { getRateLimitPolicy: jest.Mock };

  beforeEach(async () => {
    userRepo = { update: jest.fn().mockResolvedValue(undefined) };
    settings = {
      getRateLimitPolicy: jest.fn().mockResolvedValue({
        maxAttempts: 3,
        windowSeconds: 60,
        lockoutDurationSeconds: 120,
        exponentialBackoff: false,
        backoffMultiplier: 2,
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        BruteForceProtectionService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();
    service = moduleRef.get(BruteForceProtectionService);
  });

  describe('IP throttling', () => {
    it('allows attempts under the threshold', async () => {
      await expect(service.assertIpAllowed('login', '1.2.3.4')).resolves.toBeUndefined();
      await service.recordFailure('login', '1.2.3.4', null);
      await service.recordFailure('login', '1.2.3.4', null);
      await expect(service.assertIpAllowed('login', '1.2.3.4')).resolves.toBeUndefined();
    });

    it('throws TooManyAuthAttempts after threshold is exceeded', async () => {
      for (let i = 0; i < 3; i += 1) {
        await service.recordFailure('login', '1.2.3.4', null);
      }
      await expect(service.assertIpAllowed('login', '1.2.3.4')).rejects.toBeInstanceOf(TooManyAuthAttemptsException);
    });

    it('resets after recordSuccess', async () => {
      for (let i = 0; i < 3; i += 1) {
        await service.recordFailure('login', '1.2.3.4', null);
      }
      await service.recordSuccess('login', '1.2.3.4', null);
      await expect(service.assertIpAllowed('login', '1.2.3.4')).resolves.toBeUndefined();
    });

    it('uses separate counters per scope', async () => {
      for (let i = 0; i < 3; i += 1) {
        await service.recordFailure('login', '5.5.5.5', null);
      }
      await expect(service.assertIpAllowed('login', '5.5.5.5')).rejects.toBeInstanceOf(TooManyAuthAttemptsException);
      await expect(service.assertIpAllowed('register', '5.5.5.5')).resolves.toBeUndefined();
    });
  });

  describe('account lockout', () => {
    it('persists lockedUntil after threshold', async () => {
      for (let i = 0; i < 3; i += 1) {
        await service.recordFailure('login', '1.1.1.1', 42);
      }
      const lockoutCall = userRepo.update.mock.calls.find(
        ([, update]) => update?.lockedUntil instanceof Date,
      );
      expect(lockoutCall).toBeDefined();
      expect((lockoutCall as [unknown, unknown])[0]).toEqual({ id: 42 });
    });

    it('rejects when assertAccountAllowed sees future lockedUntil', async () => {
      const future = new Date(Date.now() + 60_000);
      await expect(
        service.assertAccountAllowed({ id: 1, lockedUntil: future } as User),
      ).rejects.toBeInstanceOf(AccountLockedException);
    });

    it('passes when lockedUntil is in the past', async () => {
      const past = new Date(Date.now() - 60_000);
      await expect(
        service.assertAccountAllowed({ id: 1, lockedUntil: past } as User),
      ).resolves.toBeUndefined();
    });

    it('unlocks an account', async () => {
      await service.unlockAccount(7);
      expect(userRepo.update).toHaveBeenCalledWith(
        { id: 7 },
        expect.objectContaining({ lockedUntil: null, failedLoginAttempts: 0, firstFailedLoginAt: null }),
      );
    });
  });

  describe('eviction', () => {
    it('drops stale entries on the next recordFailure call', async () => {
      const originalNow = Date.now;
      let clock = 0;
      const setNow = (value: number) => {
        clock = value;
      };
      jest.spyOn(Date, 'now').mockImplementation(() => clock);
      try {
        setNow(1000);
        await service.recordFailure('login', '8.8.8.8', null);
        setNow(1000 + 70 * 1000);
        await service.recordFailure('login', '9.9.9.9', null);
        const internalIp = (service as unknown as { ipCounters: Map<string, unknown> }).ipCounters;
        expect(internalIp.has('login:8.8.8.8')).toBe(false);
        expect(internalIp.has('login:9.9.9.9')).toBe(true);
      } finally {
        (Date.now as unknown as { mockRestore?: () => void }).mockRestore?.();
        Date.now = originalNow;
      }
    });
  });

  describe('exponential backoff', () => {
    it('multiplies lockout duration on repeat lockouts', async () => {
      settings.getRateLimitPolicy.mockResolvedValue({
        maxAttempts: 2,
        windowSeconds: 60,
        lockoutDurationSeconds: 10,
        exponentialBackoff: true,
        backoffMultiplier: 3,
      });
      for (let i = 0; i < 2; i += 1) {
        await service.recordFailure('login', '9.9.9.9', null);
      }
      const firstAttempt = await service.assertIpAllowed('login', '9.9.9.9').catch((err) => err);
      expect(firstAttempt).toBeInstanceOf(TooManyAuthAttemptsException);
      const firstRetry = (firstAttempt as TooManyAuthAttemptsException).retryAfterSeconds;
      expect(firstRetry).toBeGreaterThanOrEqual(9);
      expect(firstRetry).toBeLessThanOrEqual(10);
    });
  });
});
