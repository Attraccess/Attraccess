import { Logger, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import type { UserAccount } from '@attraccess/application-models';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
import { UNIT_OF_WORK } from '../../database/unit-of-work';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { LicenseService } from '../../license/license.service';
import { MetricsService } from '../../metrics/metrics.service';
import { RATE_LIMIT_DEFAULTS } from '../../settings/constants';
import { SETTINGS_ROWS } from '../../settings/settings-rows.port';
import { SettingsService } from '../../settings/settings.service';
import { AuthService } from '../auth/auth.service';
import { CREDENTIAL_STORE } from '../auth/credentials/credential-store.port';
import { TwoFactorService } from '../auth/two-factor.service';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { ACCOUNT_LOCKOUT_STORE, type AccountLockoutStore } from '../rate-limiting/account-lockout.port';
import { AuthAuditLogger } from '../rate-limiting/auth-audit.logger';
import { AuthRateLimitInterceptor } from '../rate-limiting/auth-rate-limit.interceptor';
import { BruteForceProtectionService } from '../rate-limiting/brute-force.service';
import { RbacService } from '../rbac/rbac.service';
import { RBAC_STORE } from '../rbac/rbac.port';
import { UserAccounts } from './accounts/user-accounts';
import { UserDirectory } from './directory/user-directory';
import { FakeUnitOfWork, InMemoryUserStore } from './fakes/in-memory-user-store.test-fixture';
import { SignupDomainService } from './signup-domain.service';
import { UnverifiedEmailChangeService } from './unverified-email-change.service';
import { UserPasswordService } from './user-password.service';
import { UserRegistrationService } from './user-registration.service';
import { USER_STORE } from './user-store.port';
import { UsersRegistrationController } from './users-registration.controller';
import { UsersService } from './users.service';

/**
 * POST /users/change-unverified-email over HTTP: the real controller, global ValidationPipe (as main.bootstrap.ts
 * configures it), AuthRateLimitInterceptor, BruteForceProtectionService, UnverifiedEmailChangeService, AuthService
 * (bcrypt password check), SignupDomainService and UsersService/UserDirectory. Only persistence (users, credentials,
 * settings, lockout) and outbound mail are in-memory fakes.
 */

const PASSWORD = 'Correct-Hummingbird-9!plate';
const ROUTE = '/users/change-unverified-email';
const policy = RATE_LIMIT_DEFAULTS; // maxAttempts 5, 900 s window and lockout
const smtpRefused = () => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:587'), { code: 'ECONNREFUSED' });

describe('POST /users/change-unverified-email (HTTP integration)', () => {
  let passwordHash: string;
  let app: NestExpressApplication;
  let store: InMemoryUserStore;
  let emailService: { sendVerificationEmail: jest.Mock; sendUsernameChangedEmail: jest.Mock };
  let audit: { record: jest.Mock };
  let lockoutStore: jest.Mocked<AccountLockoutStore>;
  let twoFactorEnabled: Set<number>;
  let signupWhitelist: string | null;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(async () => {
    store = new InMemoryUserStore();
    emailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendUsernameChangedEmail: jest.fn().mockResolvedValue(undefined),
    };
    audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    twoFactorEnabled = new Set();
    signupWhitelist = null; // unset = '*'
    // Persists the lock the way the TypeORM adapter does, so assertAccountAllowed also sees user.lockedUntil.
    lockoutStore = {
      recordFailureStreak: jest.fn(async (userId, streak) => {
        await store.updateUser(userId, {
          failedLoginAttempts: streak.failedAttempts,
          firstFailedLoginAt: streak.firstFailedAt,
        });
      }),
      lockAccount: jest.fn(async (userId, lockedUntil) => {
        await store.updateUser(userId, { lockedUntil, failedLoginAttempts: 0, firstFailedLoginAt: null });
      }),
      clearLockout: jest.fn(async (userId) => {
        await store.updateUser(userId, { lockedUntil: null, failedLoginAttempts: 0, firstFailedLoginAt: null });
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersRegistrationController],
      providers: [
        UnverifiedEmailChangeService,
        AuthService,
        SignupDomainService,
        UsersService,
        UserAccounts,
        UserDirectory,
        BruteForceProtectionService,
        AuthRateLimitInterceptor,
        Reflector,
        { provide: USER_STORE, useValue: store },
        { provide: UNIT_OF_WORK, useValue: new FakeUnitOfWork() },
        { provide: RBAC_STORE, useValue: {} },
        { provide: ACCOUNT_LOCKOUT_STORE, useValue: lockoutStore },
        { provide: SettingsService, useValue: { getRateLimitPolicy: async () => policy } },
        {
          provide: SETTINGS_ROWS,
          useValue: {
            findValue: jest.fn(async (parent: string, key: string) =>
              parent === 'auth' && key === 'local_signup_domain_whitelist' ? signupWhitelist : null,
            ),
            upsertValue: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: CREDENTIAL_STORE,
          // Every seeded account has the same local password.
          useValue: { findLocalPasswordHash: jest.fn(async () => passwordHash) },
        },
        { provide: EmailService, useValue: emailService },
        { provide: AUDIT_RECORDER, useValue: audit },
        { provide: AuthAuditLogger, useValue: { log: jest.fn() } },
        {
          provide: TwoFactorService,
          useValue: {
            getStatus: jest.fn(async (user: { id: number }) => ({ enabled: twoFactorEnabled.has(user.id) })),
          },
        },
        { provide: TokenHashService, useValue: { hashToken: (token: string) => `hashed:${token}` } },
        { provide: LicenseService, useValue: { verifyLicense: jest.fn() } },
        { provide: MetricsService, useValue: {} },
        { provide: RbacService, useValue: {} },
        { provide: PasswordPolicyService, useValue: {} },
        { provide: UserRegistrationService, useValue: {} },
        { provide: UserPasswordService, useValue: {} },
      ],
    })
      // Only the admin-only whitelist routes use these; this route is public.
      .overrideGuard(DualAuthGuard)
      .useValue({ canActivate: () => false })
      .overrideGuard(EffectivePermissionsGuard)
      .useValue({ canActivate: () => false })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    app.set('trust proxy', true); // lets a test pick its client IP via X-Forwarded-For
    await app.listen(0, '127.0.0.1');
  });

  afterEach(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  /** The service logs a mail outage; keep it out of the test output but prove it was logged. */
  const silenceErrorLog = () => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  const seed = (overrides: Partial<UserAccount> = {}): UserAccount =>
    store.seed({
      username: 'jane',
      email: 'jane@typo.example',
      isEmailVerified: false,
      emailVerificationToken: 'hashed:original-token',
      emailVerificationTokenExpiresAt: new Date('2099-01-01T00:00:00Z'),
      ...overrides,
    })[0];

  const stored = (id: number) => store.users.find((user) => user.id === id);

  const change = (body: Record<string, unknown>, ip = '203.0.113.10') =>
    request(app.getHttpServer()).post(ROUTE).set('X-Forwarded-For', ip).send(body);

  const valid = (overrides: Record<string, unknown> = {}) => ({
    identifier: 'jane',
    password: PASSWORD,
    newEmail: 'jane@example.org',
    ...overrides,
  });

  const expectUnchanged = (user: UserAccount) =>
    expect(stored(user.id)).toMatchObject({
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      emailVerificationToken: user.emailVerificationToken,
      emailVerificationTokenExpiresAt: user.emailVerificationTokenExpiresAt,
    });

  it('changes the address of an unverified account and sends the new link to it', async () => {
    const user = seed();

    const res = await change(valid());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'OK' });
    const after = stored(user.id);
    expect(after).toMatchObject({ email: 'jane@example.org', isEmailVerified: false });
    expect(after.emailVerificationToken).not.toBe(user.emailVerificationToken);
    expect(after.emailVerificationTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(emailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id, email: 'jane@example.org' }),
      after.emailVerificationToken,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'identity.unverified_email_changed',
        outcome: 'succeeded',
        actor: expect.objectContaining({ id: user.id }),
        subject: expect.objectContaining({ id: user.id }),
      }),
    );
  });

  it('accepts the email address as identifier', async () => {
    const user = seed();

    const res = await change(valid({ identifier: 'jane@typo.example' }));

    expect(res.status).toBe(200);
    expect(stored(user.id).email).toBe('jane@example.org');
  });

  it('sends a fresh link to the same address when the new email equals the current one', async () => {
    const user = seed();

    const res = await change(valid({ newEmail: 'JANE@typo.example' }));

    expect(res.status).toBe(200);
    expect(stored(user.id).email).toBe('jane@typo.example');
    const [[recipient, token]] = emailService.sendVerificationEmail.mock.calls;
    expect(recipient).toMatchObject({ id: user.id, email: 'jane@typo.example' });
    // generateEmailVerificationToken stores only the hash of the token it mails.
    expect(stored(user.id).emailVerificationToken).toBe(`hashed:${token}`);
  });

  it('answers an unknown identifier and a wrong password identically (401, same body)', async () => {
    const user = seed();

    const unknown = await change(valid({ identifier: 'nobody' }));
    const wrongPassword = await change(valid({ password: 'Wrong-Hummingbird-9!plate' }));

    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknown.body);
    expect(unknown.body).toEqual({
      statusCode: 401,
      message: 'UnkownUserOrPasswordException',
      error: 'Unauthorized',
    });
    expectUnchanged(user);
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    // The wrong password is audited against the account and counts toward its lockout; the unknown one cannot.
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'identity.unverified_email_changed',
        outcome: 'failed',
        details: { reason: 'invalid_credentials' },
        subject: expect.objectContaining({ id: user.id }),
      }),
    );
    expect(lockoutStore.recordFailureStreak).toHaveBeenCalledTimes(1);
    expect(lockoutStore.recordFailureStreak).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ failedAttempts: 1 }),
    );
  });

  it.each([
    ['an invalid newEmail', { newEmail: 'not-an-email' }],
    ['a missing newEmail', { newEmail: undefined }],
    ['an empty password', { password: '' }],
    ['an empty identifier', { identifier: '' }],
  ])('rejects %s with 400 from the DTO before touching the account', async (_label, overrides) => {
    const user = seed();

    const res = await change(valid(overrides));

    expect(res.status).toBe(400);
    expect(res.body.statusCode).toBe(400);
    expect(Array.isArray(res.body.message)).toBe(true);
    expectUnchanged(user);
    expect(lockoutStore.recordFailureStreak).not.toHaveBeenCalled();
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('refuses a verified account with 403 EmailAlreadyVerified and changes nothing', async () => {
    const user = seed({ isEmailVerified: true, emailVerificationToken: null, emailVerificationTokenExpiresAt: null });

    const res = await change(valid());

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ statusCode: 403, message: 'EmailAlreadyVerified' });
    expectUnchanged(user);
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('refuses an account with two-factor authentication with 403 UnverifiedEmailChangeNotAllowed', async () => {
    const user = seed();
    twoFactorEnabled.add(user.id);

    const res = await change(valid());

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ statusCode: 403, message: 'UnverifiedEmailChangeNotAllowed' });
    expectUnchanged(user);
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('refuses an address another account uses with 400 "Email already exists"', async () => {
    const user = seed();
    store.seed({ username: 'other', email: 'taken@example.org' });

    const res = await change(valid({ newEmail: 'Taken@Example.org' }));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ statusCode: 400, message: 'Email already exists' });
    expectUnchanged(user);
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('refuses a domain outside the signup allowlist with the exception signup uses', async () => {
    const user = seed();
    signupWhitelist = 'example.org, makerspace.test';

    const blocked = await change(valid({ newEmail: 'jane@elsewhere.test' }));

    expect(blocked.status).toBe(403);
    expect(blocked.body).toMatchObject({ statusCode: 403, message: 'ForbiddenSignupDomainException' });
    expectUnchanged(user);
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();

    const allowed = await change(valid({ newEmail: 'jane@makerspace.test' }));
    expect(allowed.status).toBe(200);
    expect(stored(user.id).email).toBe('jane@makerspace.test');
  });

  it('answers 503 EmailSendFailed when SMTP refuses the connection and takes the change back', async () => {
    const user = seed();
    const errorLog = silenceErrorLog();
    emailService.sendVerificationEmail.mockRejectedValueOnce(smtpRefused());

    const res = await change(valid());

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ statusCode: 503, message: 'EmailSendFailed' });
    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane@example.org' }),
      expect.any(String),
    );
    // UserDirectory.changeEmail committed, then reverted the email and the original token after the failed send.
    expectUnchanged(user);
    expect(audit.record).not.toHaveBeenCalledWith(expect.objectContaining({ outcome: 'succeeded' }));
    expect(errorLog).toHaveBeenCalledWith(
      `Could not send the verification email for user ID: ${user.id}`,
      expect.stringContaining('ECONNREFUSED'),
    );
  });

  it('answers 503 EmailSendFailed when re-sending to the same address fails', async () => {
    seed();
    silenceErrorLog();
    emailService.sendVerificationEmail.mockRejectedValueOnce(smtpRefused());

    const res = await change(valid({ newEmail: 'jane@typo.example' }));

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ statusCode: 503, message: 'EmailSendFailed' });
  });

  it('locks the account after maxAttempts wrong passwords, even for the right password from another IP', async () => {
    const user = seed();

    for (let i = 0; i < policy.maxAttempts; i += 1) {
      const res = await change(valid({ password: `wrong-${i}` }), '203.0.113.10');
      expect(res.status).toBe(401);
    }
    expect(lockoutStore.lockAccount).toHaveBeenCalledWith(user.id, expect.any(Date));

    const locked = await change(valid(), '198.51.100.20');
    expect(locked.status).toBe(423);
    expect(locked.body).toMatchObject({ statusCode: 423, message: 'AccountLocked' });
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    expectUnchanged(user);
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();

    // The IP that sent the wrong passwords is throttled before the account is even looked up.
    const throttled = await change(valid(), '203.0.113.10');
    expect(throttled.status).toBe(429);
    expect(throttled.body).toMatchObject({ statusCode: 429, message: 'TooManyAuthAttempts' });
    expect(Number(throttled.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('throttles an IP that sprays unknown identifiers with 429, leaving other IPs alone', async () => {
    const user = seed();

    for (let i = 0; i < policy.maxAttempts; i += 1) {
      expect((await change(valid({ identifier: `ghost-${i}` }), '203.0.113.10')).status).toBe(401);
    }

    const blocked = await change(valid(), '203.0.113.10');
    expect(blocked.status).toBe(429);
    expectUnchanged(user);

    expect((await change(valid(), '198.51.100.20')).status).toBe(200);
  });

  it('does not reset the IP failure counter on success (clearFailuresOnSuccess: false)', async () => {
    const user = seed();
    const ip = '203.0.113.10';

    for (let i = 0; i < policy.maxAttempts - 1; i += 1) {
      expect((await change(valid({ identifier: `ghost-${i}` }), ip)).status).toBe(401);
    }

    const success = await change(valid(), ip);
    expect(success.status).toBe(200);
    expect(stored(user.id).email).toBe('jane@example.org');

    // Had the success cleared the counter, this would be failure 1 of 5 instead of the 5th.
    expect((await change(valid({ identifier: 'ghost-last' }), ip)).status).toBe(401);

    const blocked = await change(valid({ identifier: 'jane@example.org', newEmail: 'jane@makerspace.test' }), ip);
    expect(blocked.status).toBe(429);
    expect(stored(user.id).email).toBe('jane@example.org');
  });
});
