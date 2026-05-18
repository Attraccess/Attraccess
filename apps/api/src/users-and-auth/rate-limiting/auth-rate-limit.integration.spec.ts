import { Body, Controller, INestApplication, Module, Post, UnauthorizedException, UseInterceptors } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { BruteForceProtectionService } from './brute-force.service';
import { AuthAuditLogger } from './auth-audit.logger';
import { AuthRateLimitInterceptor } from './auth-rate-limit.interceptor';
import { AuthRateLimit } from './rate-limit.decorator';
import { SettingsService } from '../../settings/settings.service';
import * as guard from './login.rate-limit.guard';

@Controller()
@UseInterceptors(AuthRateLimitInterceptor)
class FakeController {
  @Post('register')
  @AuthRateLimit('register')
  register(@Body() body: { fail?: boolean }) {
    if (body?.fail) {
      throw new UnauthorizedException('boom');
    }
    return { ok: true };
  }
}

const policy = {
  maxAttempts: 3,
  windowSeconds: 60,
  lockoutDurationSeconds: 120,
  exponentialBackoff: false,
  backoffMultiplier: 2,
};

@Module({
  controllers: [FakeController],
  providers: [
    AuthRateLimitInterceptor,
    Reflector,
    { provide: AuthAuditLogger, useValue: { log: jest.fn() } },
    {
      provide: BruteForceProtectionService,
      useFactory: () =>
        new BruteForceProtectionService(
          { update: jest.fn().mockResolvedValue(undefined) } as never,
          { getRateLimitPolicy: async () => policy } as SettingsService,
        ),
    },
  ],
})
class FakeModule {}

const FIXED_TEST_IP = '127.0.0.1';

describe('AuthRateLimitInterceptor (HTTP integration)', () => {
  let app: INestApplication;
  let bruteForce: BruteForceProtectionService;

  beforeAll(async () => {
    jest.spyOn(guard, 'resolveIp').mockReturnValue(FIXED_TEST_IP);
    const moduleRef = await Test.createTestingModule({ imports: [FakeModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    bruteForce = app.get(BruteForceProtectionService);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('returns 429 with Retry-After after threshold and recovers after recordSuccess', async () => {
    for (let i = 0; i < policy.maxAttempts; i += 1) {
      const res = await request(app.getHttpServer()).post('/register').send({ fail: true });
      expect(res.status).toBe(401);
    }
    const blocked = await request(app.getHttpServer()).post('/register').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    await bruteForce.recordSuccess('register', FIXED_TEST_IP, null);
    const after = await request(app.getHttpServer()).post('/register').send({});
    expect(after.status).toBe(201);
  });
});
