import { Body, Controller, Module, Post, UnauthorizedException, UseInterceptors } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { BruteForceProtectionService } from './brute-force.service';
import { AuthAuditLogger } from './auth-audit.logger';
import { AuthRateLimitInterceptor } from './auth-rate-limit.interceptor';
import { AuthRateLimit } from './rate-limit.decorator';
import { SettingsService } from '../../settings/settings.service';

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

describe('AuthRateLimitInterceptor (HTTP integration)', () => {
  let app: NestExpressApplication;
  let bruteForce: BruteForceProtectionService;

  async function init(trustProxy: boolean | number | string): Promise<void> {
    const moduleRef = await Test.createTestingModule({ imports: [FakeModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.set('trust proxy', trustProxy);
    await app.init();
    bruteForce = app.get(BruteForceProtectionService);
  }

  afterEach(async () => {
    await app?.close();
  });

  const hammerToLockout = async (headers: Record<string, string> = {}) => {
    for (let i = 0; i < policy.maxAttempts; i += 1) {
      const res = await request(app.getHttpServer()).post('/register').set(headers).send({ fail: true });
      expect(res.status).toBe(401);
    }
  };

  describe('without trust proxy (default)', () => {
    beforeEach(() => init(false));

    it('returns 429 with Retry-After after threshold and recovers after recordSuccess', async () => {
      await hammerToLockout();
      const blocked = await request(app.getHttpServer()).post('/register').send({});
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

      await bruteForce.recordSuccess('register', '127.0.0.1', null);
      const after = await request(app.getHttpServer()).post('/register').send({});
      expect(after.status).toBe(201);
    });

    it('ignores spoofed X-Forwarded-For: distinct fake client IPs share the proxy socket bucket', async () => {
      await hammerToLockout({ 'X-Forwarded-For': '203.0.113.1' });

      const spoofedDifferentClient = await request(app.getHttpServer())
        .post('/register')
        .set('X-Forwarded-For', '203.0.113.99')
        .send({});

      expect(spoofedDifferentClient.status).toBe(429);
    });
  });

  describe('with trust proxy = 1 (single reverse proxy)', () => {
    beforeEach(() => init(1));

    it('buckets by the real client IP from X-Forwarded-For', async () => {
      const clientA = '203.0.113.1';
      const clientB = '203.0.113.2';

      await hammerToLockout({ 'X-Forwarded-For': clientA });

      const blockedA = await request(app.getHttpServer()).post('/register').set('X-Forwarded-For', clientA).send({});
      expect(blockedA.status).toBe(429);
      expect(blockedA.headers['retry-after']).toBeDefined();

      const allowedB = await request(app.getHttpServer()).post('/register').set('X-Forwarded-For', clientB).send({});
      expect(allowedB.status).toBe(201);
    });
  });

  describe('with trust proxy = 2 (CDN in front of reverse proxy)', () => {
    beforeEach(() => init(2));

    it('buckets by the leftmost client across two trusted hops', async () => {
      const proxy = '198.51.100.7';
      const clientA = '203.0.113.1';
      const clientB = '203.0.113.2';

      await hammerToLockout({ 'X-Forwarded-For': `${clientA}, ${proxy}` });

      const blockedA = await request(app.getHttpServer())
        .post('/register')
        .set('X-Forwarded-For', `${clientA}, ${proxy}`)
        .send({});
      expect(blockedA.status).toBe(429);

      const allowedB = await request(app.getHttpServer())
        .post('/register')
        .set('X-Forwarded-For', `${clientB}, ${proxy}`)
        .send({});
      expect(allowedB.status).toBe(201);
    });
  });
});
