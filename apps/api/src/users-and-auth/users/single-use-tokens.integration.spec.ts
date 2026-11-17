import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMock } from '@golevelup/ts-jest';
import { ForbiddenException } from '@nestjs/common';
import {
  AuthenticationDetail,
  entities,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyOverride,
  User,
} from '@attraccess/database-entities';
import { AuthenticationType } from '@attraccess/application-models';
import { DataSource } from 'typeorm';
import { TypeOrmCredentialStore } from '../../database/adapters/auth/typeorm-credential.store';
import { TypeOrmPasswordPolicyStore } from '../../database/adapters/auth/typeorm-password-policy.store';
import { unitOfWorkFor } from '../../database/adapters/shared-unit-of-work';
import { TransactionContextResolver } from '../../database/adapters/transaction-context';
import * as migrations from '../../database/migrations';
import { closeResourceTransactionConnection } from '../../database/sqlite/run-serialized-transaction';
import { createDataSource } from '../../database/sqlite/sqlite-connection';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { LicenseService } from '../../license/license.service';
import { MetricsService } from '../../metrics/metrics.service';
import { AuthService, UserEmailInvalidVerificationTokenException } from '../auth/auth.service';
import { HibpClient } from '../password-policy/hibp.client';
import { PasswordPolicyViolationException } from '../password-policy/password-policy.errors';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { ZxcvbnService } from '../password-policy/zxcvbn.service';
import { RbacService } from '../rbac/rbac.service';
import { composeUsersService } from './fixtures/compose.test-fixture';
import { UserPasswordService } from './user-password.service';
import { UsersService } from './users.service';

const INITIAL_PASSWORD = 'Initial-Hummingbird-9!plate';
const FIRST_RESET_PASSWORD = 'Tr0ub4dor-Hummingbird-9!plate';
const SECOND_RESET_PASSWORD = 'Diff3rent-Hummingbird-9!plate';
const TOO_SHORT_PASSWORD = 'a1!';

describe('single-use reset and verification tokens (integration)', () => {
  let source: DataSource;
  let directory: string;
  let users: UsersService;
  let auth: AuthService;
  let passwords: UserPasswordService;
  let emailService: EmailService;
  let userCount = 0;

  beforeAll(async () => {
    // The unit of work commits on its own connection, so the database must be a file.
    directory = await mkdtemp(join(tmpdir(), 'single-use-tokens-'));
    source = await createDataSource({
      type: 'sqlite',
      database: join(directory, 'tokens.sqlite'),
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    }).initialize();
    await source.runMigrations();

    const rbac = createMock<RbacService>({ getEffectivePermissions: async () => new Set<string>() });
    emailService = createMock<EmailService>();
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
    const unitOfWork = unitOfWorkFor(source);
    const credentials = new TypeOrmCredentialStore(
      source.getRepository(AuthenticationDetail),
      new TransactionContextResolver(source, unitOfWork),
    );
    const passwordPolicy = new PasswordPolicyService(
      new TypeOrmPasswordPolicyStore(
        source.getRepository(PasswordPolicy),
        source.getRepository(PasswordPolicyOverride),
        source.getRepository(PasswordHistory),
        unitOfWork,
      ),
      credentials,
      unitOfWork,
      createMock<HibpClient>({ check: async () => ({ pwned: false, count: 0, available: true }) }),
      createMock<ZxcvbnService>({
        evaluate: () => ({ score: 4, guessesLog10: 12, crackTimesSeconds: {}, warning: '', suggestions: [] }),
      }),
      rbac,
      { record: jest.fn() },
    );
    auth = new AuthService(emailService, credentials, users, tokenHash, createMock<MetricsService>(), passwordPolicy);
    // Keep password history on so a rejected reset can be shown not to archive anything.
    await passwordPolicy.getPolicy();
    await passwordPolicy.updatePolicy({ historySize: 3, checkHIBP: false });
    passwords = new UserPasswordService(users, auth, emailService, tokenHash, passwordPolicy);
  }, 60_000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (source) await closeResourceTransactionConnection(source);
    if (source?.isInitialized) await source.destroy();
    if (directory) await rm(directory, { recursive: true, force: true });
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

    it('consumes the reset token even when the password-changed email fails', async () => {
      const user = await createLocalUser();
      const token = await auth.generatePasswordResetToken(user.email);
      jest.spyOn(emailService, 'sendPasswordChangedEmail').mockRejectedValueOnce(new Error('SMTP down'));

      await expect(
        passwords.changePasswordViaResetToken(user.id, { token, password: FIRST_RESET_PASSWORD }),
      ).rejects.toThrow('SMTP down');

      expect(await persisted(user.id)).toMatchObject({ passwordResetToken: null, passwordResetTokenExpiresAt: null });
      await expect(
        passwords.changePasswordViaResetToken(user.id, { token, password: SECOND_RESET_PASSWORD }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await passwordMatches(user.id, SECOND_RESET_PASSWORD)).toBe(false);
    });

    it('rejects an expired reset token without changing the password or history', async () => {
      const user = await createLocalUser();
      const token = await auth.generatePasswordResetToken(user.email);
      await source.getRepository(User).update(user.id, { passwordResetTokenExpiresAt: new Date(Date.now() - 1000) });

      // A password the policy rejects proves the expiry check runs first.
      await expect(
        passwords.changePasswordViaResetToken(user.id, { token, password: TOO_SHORT_PASSWORD }),
      ).rejects.toThrow(new ForbiddenException('Invalid token'));
      await expect(
        passwords.changePasswordViaResetToken(user.id, { token, password: FIRST_RESET_PASSWORD }),
      ).rejects.toThrow(new ForbiddenException('Invalid token'));
      expect(await passwordMatches(user.id, INITIAL_PASSWORD)).toBe(true);
      expect(await historyCount(user.id)).toBe(0);
    });

    it('rejects a reset token without a stored expiry', async () => {
      const user = await createLocalUser();
      const token = await auth.generatePasswordResetToken(user.email);
      await source.getRepository(User).update(user.id, { passwordResetTokenExpiresAt: null });

      await expect(
        passwords.changePasswordViaResetToken(user.id, { token, password: FIRST_RESET_PASSWORD }),
      ).rejects.toThrow(new ForbiddenException('Invalid token'));
      expect(await passwordMatches(user.id, INITIAL_PASSWORD)).toBe(true);
      expect(await historyCount(user.id)).toBe(0);
    });

    it('keeps the reset token usable when the new password violates the policy', async () => {
      const user = await createLocalUser();
      const token = await auth.generatePasswordResetToken(user.email);

      await expect(
        passwords.changePasswordViaResetToken(user.id, { token, password: TOO_SHORT_PASSWORD }),
      ).rejects.toBeInstanceOf(PasswordPolicyViolationException);
      expect((await persisted(user.id)).passwordResetToken).not.toBeNull();

      await passwords.changePasswordViaResetToken(user.id, { token, password: FIRST_RESET_PASSWORD });
      expect(await passwordMatches(user.id, FIRST_RESET_PASSWORD)).toBe(true);
      expect(await historyCount(user.id)).toBe(1);
    });

    it('accepts a reset token shortly before its expiry', async () => {
      const user = await createLocalUser();
      const token = await auth.generatePasswordResetToken(user.email);
      await source.getRepository(User).update(user.id, { passwordResetTokenExpiresAt: new Date(Date.now() + 60_000) });

      await passwords.changePasswordViaResetToken(user.id, { token, password: FIRST_RESET_PASSWORD });

      expect(await passwordMatches(user.id, FIRST_RESET_PASSWORD)).toBe(true);
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
