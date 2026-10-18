import { SSOProviderType, User } from '@attraccess/application-models';
import { getSupportedDeviceLanguage } from '@attraccess/shared';
import { SettingsService } from '../../../settings/settings.service';

import { DatabaseTransactions, TransactionScope } from '../../../database/transaction-scope';
import { NewUserAccount, UserOperations, UserPersistence, UserRelations, USER_WRITES } from '../persistence/port';
export type { UserListOptions, UpdateUserData } from '../persistence/port';
import { BadRequestException, ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';

import { randomBytes } from 'crypto';

import { LicenseError, LicenseService } from '../../../license/license.service';

import { EmailService } from '../../../email/email.service';

import { MetricsService } from '../../../metrics/metrics.service';

import { RbacService } from '../../rbac/rbac.service';
import { z } from 'zod';

export class DeleteAccountTokenInvalidException extends BadRequestException {
  constructor() {
    super('DeleteAccountTokenInvalidException');
  }
}

export class DeleteAccountTokenExpiredException extends UnauthorizedException {
  constructor() {
    super('DeleteAccountTokenExpiredException');
  }
}

export class UserHasActiveUsageSessionsException extends BadRequestException {
  constructor() {
    super('UserHasActiveUsageSessions');
  }
}

export const FindOneOptionsSchema = z
  .object({
    id: z.number(),
    username: z.string().min(1),
    email: z.string().email(),
    externalIdentifier: z.string().optional(),
  })
  .partial()
  .refine((data) => Object.values(data).filter((val) => val !== undefined).length > 0, {
    message: 'At least one search criteria must be provided',
  });

export type FindOneOptions = z.infer<typeof FindOneOptionsSchema>;

export abstract class UserAccounts {
  async findOne(options: FindOneOptions, relations?: UserRelations, scope?: TransactionScope): Promise<User | null> {
    const validatedOptions = FindOneOptionsSchema.parse(options);

    return this.accountOperations(scope).account(
      {
        ...validatedOptions,
        ...(validatedOptions.username === undefined
          ? {}
          : { username: this.cleanupUsername(validatedOptions.username) }),
      },
      relations,
    );
  }

  protected accountOperations(scope?: TransactionScope): UserOperations {
    return scope ? scope.resolve(USER_WRITES) : this.persistence;
  }

  public async isSSOUser(userId: number): Promise<boolean> {
    return this.persistence.ssoUser(userId);
  }
  public async findOneBySSO(providerType: SSOProviderType, providerId: number, subject: string): Promise<User | null> {
    return this.persistence.bySso(providerType, providerId, subject);
  }
  async countUsers(): Promise<number> {
    return this.persistence.count();
  }
  async findByEmailsOrUsernames(emails: string[], usernames: string[]): Promise<User[]> {
    const normalizedEmails = [...new Set(emails.map((email) => email.trim()).filter(Boolean))];
    const normalizedUsernames = [
      ...new Set(usernames.map((username) => this.cleanupUsername(username)).filter(Boolean)),
    ];
    return this.persistence.byEmailsOrUsernames(normalizedEmails, normalizedUsernames);
  }

  async createOne(
    userData: {
      username: string;
      email: string;
      externalIdentifier: string | null;
      isEmailVerified?: boolean;
      skipUsernameSanitization?: boolean;
      locale?: string;
      isFirstTimeSetupAdmin?: boolean;
    },
    scope?: TransactionScope,
    options: { excludedUserIdFromLicenseUsage?: number } = {},
  ): Promise<User> {
    const data = {
      username: this.cleanupUsername(userData.username),
      email: userData.email.trim(),
      externalIdentifier: userData.externalIdentifier?.trim() ?? null,
      isEmailVerified: userData.isEmailVerified ?? false,
    };
    this.logger.debug(`Creating new user - username: ${data.username}, email: ${data.email}`);

    if (!userData.skipUsernameSanitization) {
      this.validateUsernameOrThrow(data.username);
    }

    // verifying usage limits
    const operations = this.accountOperations(scope);
    const currentAmountOfUsers = await operations.count(options.excludedUserIdFromLicenseUsage);
    try {
      await this.licenseService.verifyLicense({
        usageLimits: {
          users: currentAmountOfUsers,
        },
      });
    } catch (error) {
      if (error instanceof LicenseError) {
        this.logger.warn(`Blocking user creation due to license: ${error.reason}`);
        throw new ForbiddenException(error.reason);
      }
      throw error;
    }

    // Check for existing email
    this.logger.debug(`Checking if email already exists: ${data.email}`);
    const existingEmail = await this.findOne({ email: data.email }, undefined, scope);
    if (existingEmail) {
      this.logger.debug(`Email already exists: ${data.email}`);
      throw new BadRequestException('Email already exists');
    }

    // Check for existing username
    this.logger.debug(`Checking if username already exists: ${data.username}`);
    const existingUsername = await this.findOne({ username: data.username }, undefined, scope);
    if (existingUsername) {
      this.logger.debug(`Username already exists: ${data.username}`);
      throw new BadRequestException('Username already exists');
    }

    const user: NewUserAccount = {
      ...data,
      locale: getSupportedDeviceLanguage(userData.locale) ? userData.locale.trim() : 'und',
    };
    // Account creation and its initial roles share one attempt and one commit.
    const saveUser = async (parent: TransactionScope) => {
      const writes = this.accountOperations(parent);
      const isFirstUser = (await writes.count()) === 0;
      const saved = await writes.createAccount(user);
      if (isFirstUser || userData.isFirstTimeSetupAdmin) {
        await this.rbacService.assignRoleByKey(saved.id, 'administrator', parent);
      } else await this.rbacService.assignDefaultRoles(saved.id, parent);
      return saved;
    };
    const savedUser = scope
      ? await saveUser(scope)
      : await this.transactions.run({ resourceIds: [], accountIds: [] }, saveUser);
    this.logger.debug(`User saved with ID: ${savedUser.id}`);

    if (!scope) {
      this.recordCreatedUser(savedUser);
    }
    return savedUser;
  }

  public recordCreatedUser(user: User): void {
    this.metricsService.usersRegisteredTotal.inc();
    this.metricsService.usersTotal.inc();
    this.metricsService.usersPerLocale.inc({ locale: user.locale ?? 'en' });
  }

  public async rollbackFailedRegistration(userId: number): Promise<void> {
    await this.transactions.run({ resourceIds: [], accountIds: [userId] }, (scope) =>
      this.accountOperations(scope).hardDeleteAccount(userId),
    );
  }

  public async releaseFirstTimeSetupAdminIdentifiers(scope: TransactionScope): Promise<User> {
    const operations = this.accountOperations(scope);
    const existingAdmin = await operations.firstAccount();
    if (!existingAdmin || existingAdmin.isEmailVerified)
      throw new ForbiddenException('First-time setup is already complete');
    const suffix = randomBytes(6).toString('base64url').slice(0, 8);
    const name = `first-time-setup-${existingAdmin.id}-${suffix}`;
    if (!(await operations.claimSetupAccount(existingAdmin.id, name, `${name}@deleted.local`))) {
      throw new ForbiddenException('First-time setup is already complete');
    }
    return existingAdmin;
  }

  public async rollbackFirstTimeSetupAdminReplacement(replacementUserId: number, existingAdmin: User): Promise<void> {
    await this.transactions.run(
      { resourceIds: [], accountIds: [replacementUserId, existingAdmin.id] },
      async (scope) => {
        const operations = this.accountOperations(scope);
        await operations.hardDeleteAccount(replacementUserId);
        await operations.patchAccount(existingAdmin.id, {
          username: existingAdmin.username,
          email: existingAdmin.email,
        });
      },
    );
  }

  public validateUsernameOrThrow(username: string): void {
    const trimmed = (username ?? '').trim();
    // Centralized username validation rules
    const minLength = 3;
    const maxLength = 32;
    const allowed = /^[a-zA-Z0-9_\-.]+$/;

    if (trimmed.length < minLength || trimmed.length > maxLength) {
      throw new BadRequestException('Invalid username length');
    }
    if (!allowed.test(trimmed)) {
      throw new BadRequestException('Invalid username format');
    }
  }

  public cleanupUsername(username: string): string {
    return username.trim().toLowerCase();
  }

  protected normalizeUsernameCandidate(value: string): string {
    const cleaned = this.cleanupUsername(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_.-]+/g, '.')
      .replace(/\.+/g, '.')
      .replace(/^[._-]+|[._-]+$/g, '');
    return cleaned;
  }

  public buildUsernameFromSSOClaim(rawUsername?: string | null, fallback?: string): string {
    const candidates = [rawUsername, fallback].filter(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
    );

    for (const candidate of candidates) {
      const normalized = this.normalizeUsernameCandidate(candidate);
      if (!normalized) {
        continue;
      }

      const truncated = normalized.slice(0, 32).replace(/[._-]+$/g, '');
      if (!truncated) {
        continue;
      }

      try {
        this.validateUsernameOrThrow(truncated);
        return truncated;
      } catch {
        continue;
      }
    }

    const suffix = randomBytes(6).toString('base64url').slice(0, 8).toLowerCase();
    return `sso-user-${suffix}`;
  }

  protected isEmailUniqueConstraintViolation(error: unknown): boolean {
    return this.persistence.isWriteConflict(error);
  }

  protected abstract persistence: UserPersistence;
  protected abstract transactions: DatabaseTransactions;

  protected abstract readonly logger: Logger;

  protected abstract licenseService: LicenseService;

  protected abstract readonly rbacService: RbacService;

  protected abstract readonly metricsService: MetricsService;

  protected abstract anonymizeAndSoftDelete(id: number, scope?: TransactionScope): Promise<void>;

  protected abstract emailService: EmailService;

  protected abstract readonly settingsService: SettingsService;
}
