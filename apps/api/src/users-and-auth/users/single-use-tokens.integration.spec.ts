import { createMock } from '@golevelup/ts-jest';
import { ForbiddenException } from '@nestjs/common';
import {
  AuthenticationDetail,
  AuthenticationType,
  entities,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyOverride,
  User,
} from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import * as migrations from '../../database/migrations';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { LicenseService } from '../../license/license.service';
import { MetricsService } from '../../metrics/metrics.service';
import { AuthService, UserEmailInvalidVerificationTokenException } from '../auth/auth.service';
import { HibpClient } from '../password-policy/hibp.client';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { ZxcvbnService } from '../password-policy/zxcvbn.service';
import { RbacService } from '../rbac/rbac.service';
import { composeUsersService } from './fixtures/compose.test-fixture';
import { UserPasswordService } from './user-password.service';
import { UsersService } from './users.service';

const INITIAL_PASSWORD = 'Initial-Hummingbird-9!plate';
const FIRST_RESET_PASSWORD = 'Tr0ub4dor-Hummingbird-9!plate';
const SECOND_RESET_PASSWORD = 'Diff3rent-Hummingbird-9!plate';

describe('single-use reset and verification tokens (integration)', () => {
  let source: DataSource;
  let users: UsersService;
  let auth: AuthService;
  let passwords: UserPasswordService;
  let userCount = 0;

  beforeAll(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    }).initialize();
    await source.runMigrations();

    const rbac = createMock<RbacService>({ getEffectivePermissions: async () => new Set<string>() });
    const emailService = createMock<EmailService>();
    const tokenHash = new TokenHashService({
      get: () => ({ AUTH_SESSION_SECRET: 'single-use-token-secret' }),
    } as never);
    users = composeUsersService(
      source.getRepository(User),
      undefined,
      undefined,
      undefined,
      createMock<LicenseService>(),
      emailService,
      source,
      tokenHash,
      createMock<MetricsService>(),
      rbac,
      undefined,
    );
    auth = new AuthService(
      emailService,
      source.getRepository(AuthenticationDetail),
      users,
      tokenHash,
      createMock<MetricsService>(),
    );
    const passwordPolicy = new PasswordPolicyService(
      source.getRepository(PasswordPolicy),
      source.getRepository(PasswordPolicyOverride),
      source.getRepository(PasswordHistory),
      source.getRepository(AuthenticationDetail),
      source,
      createMock<HibpClient>({ check: async () => ({ pwned: false, count: 0, available: true }) }),
      createMock<ZxcvbnService>({
        evaluate: () => ({ score: 4, guessesLog10: 12, crackTimesSeconds: {}, warning: '', suggestions: [] }),
      }),
      rbac,
      { record: jest.fn() },
    );
    // Keep password history on so a rejected reset can be shown not to archive anything.
    await passwordPolicy.getPolicy();
    await passwordPolicy.updatePolicy({ historySize: 3, checkHIBP: false });
    passwords = new UserPasswordService(users, auth, emailService, tokenHash, passwordPolicy);
  }, 60_000);

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  async function createLocalUser(): Promise<User> {
    userCount++;
    const user = await users.createOne({
      username: `single-use-${userCount}`,
      email: `single-use-${userCount}@example.test`,
      externalIdentifier: null,
    });
    await auth.addAuthenticationDetails(user.id, {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: INITIAL_PASSWORD },
    });
    return user;
  }

  const persisted = (id: number) => source.getRepository(User).findOneByOrFail({ id });

  const passwordMatches = (userId: number, password: string) =>
    auth.validateAuthenticationDetails(userId, {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password },
    });

  const historyCount = (userId: number) => source.getRepository(PasswordHistory).count({ where: { userId } });

  describe('UserDirectory.updateOne', () => {
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');

    it('clears reset token columns when given null', async () => {
      const user = await createLocalUser();
      await users.updateOne(user.id, { passwordResetToken: 'reset', passwordResetTokenExpiresAt: expiresAt });

      await users.updateOne(user.id, { passwordResetToken: null, passwordResetTokenExpiresAt: null });

      expect(await persisted(user.id)).toMatchObject({ passwordResetToken: null, passwordResetTokenExpiresAt: null });
    });

    it('clears verification token columns when given null', async () => {
      const user = await createLocalUser();
      await users.updateOne(user.id, { emailVerificationToken: 'verify', emailVerificationTokenExpiresAt: expiresAt });

      await users.updateOne(user.id, { emailVerificationToken: null, emailVerificationTokenExpiresAt: null });

      expect(await persisted(user.id)).toMatchObject({
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
      });
    });

    it('clears the external identifier when given null', async () => {
      const user = await createLocalUser();
      await users.updateOne(user.id, { externalIdentifier: 'ext-123' });

      await users.updateOne(user.id, { externalIdentifier: null });

      expect((await persisted(user.id)).externalIdentifier).toBeNull();
    });

    it('leaves omitted and undefined columns unchanged and trims strings', async () => {
      const user = await createLocalUser();
      await users.updateOne(user.id, {
        externalIdentifier: '  ext-456  ',
        emailVerificationToken: '  verify  ',
        emailVerificationTokenExpiresAt: expiresAt,
        passwordResetToken: '  reset  ',
        passwordResetTokenExpiresAt: expiresAt,
      });

      await users.updateOne(user.id, { failedLoginAttempts: 1 });
      await users.updateOne(user.id, {
        externalIdentifier: undefined,
        emailVerificationToken: undefined,
        emailVerificationTokenExpiresAt: undefined,
        passwordResetToken: undefined,
        passwordResetTokenExpiresAt: undefined,
      });

      expect(await persisted(user.id)).toMatchObject({
        externalIdentifier: 'ext-456',
        emailVerificationToken: 'verify',
        emailVerificationTokenExpiresAt: expiresAt,
        passwordResetToken: 'reset',
        passwordResetTokenExpiresAt: expiresAt,
        failedLoginAttempts: 1,
      });
    });
  });

  describe('change-password-by-token', () => {
    it('accepts a reset token once and rejects its reuse', async () => {
      const user = await createLocalUser();
      const token = await auth.generatePasswordResetToken(user.email);

      await passwords.changePasswordViaResetToken(user.id, { token, password: FIRST_RESET_PASSWORD });

      expect(await persisted(user.id)).toMatchObject({ passwordResetToken: null, passwordResetTokenExpiresAt: null });
      expect(await passwordMatches(user.id, FIRST_RESET_PASSWORD)).toBe(true);

      await expect(
        passwords.changePasswordViaResetToken(user.id, { token, password: SECOND_RESET_PASSWORD }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await passwordMatches(user.id, FIRST_RESET_PASSWORD)).toBe(true);
      expect(await passwordMatches(user.id, SECOND_RESET_PASSWORD)).toBe(false);
    });

    it('rejects an expired reset token without changing the password or history', async () => {
      const user = await createLocalUser();
      const token = await auth.generatePasswordResetToken(user.email);
      await source.getRepository(User).update(user.id, { passwordResetTokenExpiresAt: new Date(Date.now() - 1000) });

      await expect(
        passwords.changePasswordViaResetToken(user.id, { token, password: FIRST_RESET_PASSWORD }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await passwordMatches(user.id, INITIAL_PASSWORD)).toBe(true);
      expect(await historyCount(user.id)).toBe(0);
    });

    it('rejects a reset token without a stored expiry', async () => {
      const user = await createLocalUser();
      const token = await auth.generatePasswordResetToken(user.email);
      await source.getRepository(User).update(user.id, { passwordResetTokenExpiresAt: null });

      await expect(
        passwords.changePasswordViaResetToken(user.id, { token, password: FIRST_RESET_PASSWORD }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await passwordMatches(user.id, INITIAL_PASSWORD)).toBe(true);
      expect(await historyCount(user.id)).toBe(0);
    });
  });

  describe('verifyEmail', () => {
    it('accepts a verification token once and rejects its reuse', async () => {
      const user = await createLocalUser();
      const token = await auth.generateEmailVerificationToken(user);

      await auth.verifyEmail(user.email, token);

      expect(await persisted(user.id)).toMatchObject({
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
      });
      await expect(auth.verifyEmail(user.email, token)).rejects.toBeInstanceOf(
        UserEmailInvalidVerificationTokenException,
      );
    });
  });
});
