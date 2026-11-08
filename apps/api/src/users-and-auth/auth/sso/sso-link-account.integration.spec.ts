import { AuthenticationType, Setting, SSOProviderType, User } from '@attraccess/database-entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ModuleRef } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IdentityAuditService } from '../../../audit/identity-audit.service';
import { SsoAuditService } from '../../../audit/sso-audit.service';
import { CookieConfigService } from '../../../common/services/cookie-config.service';
import { EncryptionService } from '../../../encryption/encryption.service';
import { LicenseService } from '../../../license/license.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { SettingsService } from '../../../settings/settings.service';
import { AuthAuditLogger } from '../../rate-limiting/auth-audit.logger';
import { BruteForceProtectionService } from '../../rate-limiting/brute-force.service';
import { RbacService } from '../../rbac/rbac.service';
import { UsersService } from '../../users/users.service';
import { AuthService } from '../auth.service';
import { SessionService } from '../session.service';
import { SESSION_STORE, SessionStore } from '../session-store/session-store';
import { MAX_LINK_TOKEN_PASSWORD_ATTEMPTS, SSOLinkTokenService } from './link-token.service';
import { OidcCookieStateStore } from './oidc/oidc-cookie-state-store';
import { SSOOIDCGuard } from './oidc/oidc.guard';
import { SSOController } from './sso.controller';
import { SSOService } from './sso.service';

const policy = {
  maxAttempts: 5,
  windowSeconds: 60,
  lockoutDurationSeconds: 120,
  exponentialBackoff: false,
  backoffMultiplier: 2,
};

/** Just enough of the store for the link token: an in-memory map with the same insert-if-absent semantics. */
function memoryStore(): Pick<SessionStore, 'getEphemeralState' | 'putEphemeralState' | 'incrementEphemeralCounter'> {
  const state = new Map<string, { value: string; expiresAt: number }>();
  const live = (key: string) => {
    const entry = state.get(key);
    return entry && entry.expiresAt > Date.now() ? entry : undefined;
  };
  return {
    getEphemeralState: async (key) => live(key)?.value ?? null,
    putEphemeralState: async (key, value, expiresAt) => {
      if (live(key)) return false;
      state.set(key, { value, expiresAt });
      return true;
    },
    incrementEphemeralCounter: async (key, expiresAt) => {
      const next = Number(live(key)?.value ?? 0) + 1;
      state.set(key, { value: String(next), expiresAt });
      return next;
    },
  };
}

describe('POST /auth/sso/link-account (HTTP integration)', () => {
  let app: NestExpressApplication;
  let tokens: SSOLinkTokenService;
  let auth: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let audit: { log: jest.Mock };
  let bruteForce: BruteForceProtectionService;

  const userRepository = { update: jest.fn().mockResolvedValue(undefined) };
  const makeUser = (id: number, email: string) => ({
    id,
    email,
    lockedUntil: null,
    authenticationDetails: [{ id: id * 10, type: AuthenticationType.LOCAL_PASSWORD }],
  });

  const issue = (email = 'alice@example.com', ssoSubject = 'sub-1') =>
    tokens.issue({ email, providerId: 1, providerType: SSOProviderType.OIDC, ssoSubject });
  const post = (linkToken: string, password: string) =>
    request(app.getHttpServer()).post('/auth/sso/link-account').send({ linkToken, password });

  beforeEach(async () => {
    auth = {
      findSSOAuthenticationDetail: jest.fn().mockResolvedValue(null),
      validateAuthenticationDetails: jest.fn(
        async (_id: number, credentials: { details: { password: string } }) => credentials.details.password === 'right',
      ),
      findUserIdBySSO: jest.fn().mockResolvedValue(null),
      addAuthenticationDetails: jest.fn().mockResolvedValue(undefined),
      removeAuthenticationDetails: jest.fn().mockResolvedValue(undefined),
      updateSSOSubject: jest.fn(),
    };
    const known: Record<string, ReturnType<typeof makeUser>> = {
      'alice@example.com': makeUser(1, 'alice@example.com'),
      'bob@example.com': makeUser(2, 'bob@example.com'),
    };
    users = {
      findOne: jest.fn(async ({ email }: { email: string }) => known[email] ?? null),
      updateOne: jest.fn().mockResolvedValue(undefined),
    };
    audit = { log: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [SSOController],
      providers: [
        SSOLinkTokenService,
        BruteForceProtectionService,
        SSOOIDCGuard,
        { provide: SESSION_STORE, useValue: memoryStore() },
        { provide: AuthAuditLogger, useValue: audit },
        { provide: AuthService, useValue: auth },
        { provide: UsersService, useValue: users },
        { provide: SessionService, useValue: {} },
        { provide: SSOService, useValue: {} },
        { provide: CookieConfigService, useValue: {} },
        { provide: RbacService, useValue: {} },
        { provide: MetricsService, useValue: {} },
        { provide: IdentityAuditService, useValue: { record: jest.fn() } },
        { provide: SsoAuditService, useValue: { record: jest.fn() } },
        { provide: OidcCookieStateStore, useValue: {} },
        { provide: ModuleRef, useValue: { get: jest.fn() } },
        { provide: LicenseService, useValue: { verifyLicense: jest.fn().mockResolvedValue({ valid: true }) } },
        {
          provide: SettingsService,
          useValue: { getRateLimitPolicy: async () => policy, getUrl: async () => 'http://localhost' },
        },
        {
          provide: EncryptionService,
          useValue: {
            isEncrypted: () => true,
            decryptIfEncrypted: (value: string) => value,
            encrypt: (v: string) => v,
          },
        },
        {
          provide: getRepositoryToken(Setting),
          useValue: { findOneBy: async () => ({ value: 'link-secret' }), insert: jest.fn(), update: jest.fn() },
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.listen(0, '127.0.0.1');
    tokens = app.get(SSOLinkTokenService);
    bruteForce = app.get(BruteForceProtectionService);
  });

  afterEach(async () => {
    await app?.close();
  });

  it('links once and rejects a replay of the same token', async () => {
    const token = await issue();

    const first = await post(token, 'right');
    const replay = await post(token, 'right');

    expect(first.status).toBe(201);
    expect(first.body).toEqual({ OK: true });
    expect(replay.status).toBe(401);
    expect(replay.body.message).toBe('LINK_TOKEN_USED');
    expect(auth.addAuthenticationDetails).toHaveBeenCalledTimes(1);
  });

  it('links at most once for concurrent requests with the same token', async () => {
    const token = await issue();

    const responses = await Promise.all([post(token, 'right'), post(token, 'right'), post(token, 'right')]);

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(auth.addAuthenticationDetails).toHaveBeenCalledTimes(1);
  });

  it('kills a token after the allowed wrong passwords, even when the next password is right', async () => {
    const token = await issue();
    for (let i = 0; i < MAX_LINK_TOKEN_PASSWORD_ATTEMPTS; i += 1) {
      expect((await post(token, 'wrong')).status).toBe(401);
    }

    const next = await post(token, 'right');

    expect(next.status).toBe(401);
    expect(next.body.message).toBe('LINK_TOKEN_EXHAUSTED');
    expect(auth.addAuthenticationDetails).not.toHaveBeenCalled();
  });

  it('answers 429 with Retry-After after maxAttempts failures from one IP against one account', async () => {
    for (let i = 0; i < policy.maxAttempts; i += 1) {
      expect((await post(await issue(), 'wrong')).status).toBe(401);
    }

    const blocked = await post(await issue(), 'right');

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(auth.addAuthenticationDetails).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sso_link_account', outcome: 'invalid_credentials' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sso_link_account', outcome: 'rate_limited', reason: 'ip_throttled' }),
    );
  });

  it('does not let failures against one account throttle linking another account from the same IP', async () => {
    for (let i = 0; i < policy.maxAttempts; i += 1) {
      await post(await issue('alice@example.com'), 'wrong');
    }

    const bob = await post(await issue('bob@example.com', 'sub-bob'), 'right');

    expect(bob.status).toBe(201);
  });

  it('answers 423 with Retry-After for an account locked by failed logins', async () => {
    const token = await issue();
    // Locked through the account counter shared with login; no IP counter has been touched.
    for (let i = 0; i < policy.maxAttempts; i += 1) await bruteForce.recordFailure('login', '10.0.0.1', 1, 'alice');

    const locked = await post(token, 'right');

    expect(locked.status).toBe(423);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    expect(auth.addAuthenticationDetails).not.toHaveBeenCalled();
  });

  it('counts garbage tokens against the IP and refuses the IP once throttled', async () => {
    for (let i = 0; i < policy.maxAttempts * 10; i += 1) {
      expect((await post('garbage', 'x')).status).toBeGreaterThanOrEqual(400);
    }

    const blocked = await post(await issue(), 'right');

    expect(blocked.status).toBe(429);
  });

  it('does not throttle other accounts before the coarse per-IP limit when tokens are rejected', async () => {
    for (let i = 0; i < policy.maxAttempts + 2; i += 1) {
      expect((await post('garbage', 'x')).status).toBeLessThan(429);
    }

    const bob = await post(await issue('bob@example.com', 'sub-bob'), 'right');

    expect(bob.status).toBe(201);
  });

  it('rejects tokens without a token id', async () => {
    const issued = await issue();
    const [encoded] = issued.split('.');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    delete payload.jti;
    const stripped = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sign = Reflect.get(tokens as object, 'sign').bind(tokens) as (value: string) => Promise<string>;

    const response = await post(`${stripped}.${await sign(stripped)}`, 'right');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('INVALID_LINK_TOKEN');
  });
});
