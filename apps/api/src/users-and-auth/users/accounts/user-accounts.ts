import { getSupportedDeviceLanguage } from '@attraccess/shared';
import type { SSOProviderType, UserAccount, UserPatch, UserRecord } from '@attraccess/application-models';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { randomBytes } from 'crypto';

import { LicenseError, LicenseService } from '../../../license/license.service';

import { MetricsService } from '../../../metrics/metrics.service';

import { RbacService } from '../../rbac/rbac.service';
import { z } from 'zod';
import { PaginationOptions } from '../../../types/request';
import type { TransactionContext } from '../../../database/transaction-context';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../database/unit-of-work';
import { normalizeEmail } from './normalize-email';
import { USER_STORE, type UserStore } from '../user-store.port';

export type UserListOptions = PaginationOptions & {
  search?: string;
  ids?: number[];
  roleId?: number;
  roleIds?: number[];
  excludeRoleIds?: number[];
  roleMatch?: 'any' | 'all';
  emailVerified?: boolean;
  ssoProviderIds?: number[];
  excludeSsoProviderIds?: number[];
  ssoProviderNone?: boolean;
  hasSsoProvider?: boolean;
  ssoProviderMatch?: 'any' | 'all';
  includeRoles?: boolean;
};

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

export type UpdateUserData = Pick<
  UserPatch,
  | 'externalIdentifier'
  | 'emailVerificationToken'
  | 'emailVerificationTokenExpiresAt'
  | 'isEmailVerified'
  | 'passwordResetToken'
  | 'passwordResetTokenExpiresAt'
  | 'lockedUntil'
  | 'failedLoginAttempts'
  | 'firstFailedLoginAt'
>;

export const FindOneOptionsSchema = z
  .object({
    id: z.number(),
    username: z.string().min(1),
    email: z.string().email(),
  })
  .partial()
  .refine((data) => Object.values(data).filter((val) => val !== undefined).length > 0, {
    message: 'At least one search criteria must be provided',
  });

export type FindOneOptions = z.infer<typeof FindOneOptionsSchema>;

/** Looking up, creating and naming user accounts. */
@Injectable()
export class UserAccounts {
  private readonly logger = new Logger('UsersService');

  constructor(
    @Inject(USER_STORE) private readonly store: UserStore,
    private readonly licenseService: LicenseService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly metricsService: MetricsService,
    private readonly rbacService: RbacService,
  ) {}

  async findOne(
    options: FindOneOptions,
    relations?: readonly string[],
    context?: TransactionContext,
  ): Promise<UserAccount | null> {
    const validatedOptions = FindOneOptionsSchema.parse(
      options.email === undefined ? options : { ...options, email: normalizeEmail(options.email) },
    );

    return this.store.findUser(
      {
        id: validatedOptions.id,
        username: validatedOptions.username === undefined ? undefined : this.cleanupUsername(validatedOptions.username),
        email: validatedOptions.email,
      },
      relations?.includes('authenticationDetails') ?? false,
      context,
    );
  }

  public async isSSOUser(userId: number): Promise<boolean> {
    return this.store.hasSsoCredential(userId);
  }

  public async findOneBySSO(
    providerType: SSOProviderType,
    providerId: number,
    subject: string,
  ): Promise<UserAccount | null> {
    return this.store.findUserBySso(providerType, providerId, subject);
  }

  async countUsers(): Promise<number> {
    return this.store.countUsers();
  }

  async findByEmailsOrUsernames(emails: string[], usernames: string[]): Promise<UserRecord[]> {
    const normalizedEmails = Array.from(new Set(emails.map(normalizeEmail).filter((email) => email !== '')));
    const normalizedUsernames = Array.from(
      new Set(usernames.map((username) => this.cleanupUsername(username)).filter((username) => username !== '')),
    );
    return this.store.findByEmailsOrUsernames(normalizedEmails, normalizedUsernames);
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
    context?: TransactionContext,
    options: { excludedUserIdFromLicenseUsage?: number } = {},
  ): Promise<UserRecord> {
    const data = {
      username: this.cleanupUsername(userData.username),
      email: normalizeEmail(userData.email),
      externalIdentifier: userData.externalIdentifier?.trim() ?? null,
      isEmailVerified: userData.isEmailVerified ?? false,
    };
    this.logger.debug(`Creating new user - username: ${data.username}, email: ${data.email}`);

    if (!userData.skipUsernameSanitization) {
      this.validateUsernameOrThrow(data.username);
    }

    // verifying usage limits
    const currentAmountOfUsers = await this.store.countUsers(
      { excludingUserId: options.excludedUserIdFromLicenseUsage },
      context,
    );
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
    const existingEmail = await this.findOne({ email: data.email }, undefined, context);
    if (existingEmail) {
      this.logger.debug(`Email already exists: ${data.email}`);
      throw new BadRequestException('Email already exists');
    }

    // Check for existing username
    this.logger.debug(`Checking if username already exists: ${data.username}`);
    const existingUsername = await this.findOne({ username: data.username }, undefined, context);
    if (existingUsername) {
      this.logger.debug(`Username already exists: ${data.username}`);
      throw new BadRequestException('Username already exists');
    }

    // Check if this is the first user in the system
    this.logger.debug('Checking if this is the first user in the system');
    const totalUsers = await this.store.countUsers({}, context);
    const isFirstUser = totalUsers === 0;

    this.logger.debug('Saving new user to database');
    // Wrap save + role assignment in a single transaction so a role-assignment failure
    // doesn't leave an administrator-less account on a fresh install.
    const saveUser = async (transaction: TransactionContext) => {
      const saved = await this.store.insertUser(
        {
          ...data,
          // Keep an unknown preference distinct from the system fallback.
          locale: getSupportedDeviceLanguage(userData.locale) ? userData.locale.trim() : 'und',
        },
        transaction,
      );
      if (isFirstUser || userData.isFirstTimeSetupAdmin) {
        this.logger.debug('First user in system - assigning administrator role');
        await this.rbacService.assignRoleByKey(saved.id, 'administrator', transaction);
      } else {
        await this.rbacService.assignDefaultRoles(saved.id, transaction);
      }
      return saved;
    };
    const savedUser = context ? await saveUser(context) : await this.uow.run(saveUser);
    this.logger.debug(`User saved with ID: ${savedUser.id}`);

    if (!context) {
      this.recordCreatedUser(savedUser);
    }
    return savedUser;
  }

  public recordCreatedUser(user: Pick<UserRecord, 'locale'>): void {
    this.metricsService.usersRegisteredTotal.inc();
    this.metricsService.usersTotal.inc();
    this.metricsService.usersPerLocale.inc({ locale: user.locale ?? 'en' });
  }

  public async rollbackFailedRegistration(userId: number): Promise<void> {
    // This is only used for a just-created account whose verification email could not be sent.
    // It bypasses normal account-deletion rules so the first administrator can be retried.
    await this.store.discardUser(userId);
  }

  public async releaseFirstTimeSetupAdminIdentifiers(context?: TransactionContext): Promise<UserRecord> {
    const existingAdmin = await this.store.findFirstUser(context);
    if (!existingAdmin || existingAdmin.isEmailVerified) {
      throw new ForbiddenException('First-time setup is already complete');
    }

    const suffix = randomBytes(6).toString('base64url').slice(0, 8);
    // Claim the setup account only while it is the sole active account.
    const claimed = await this.store.claimFirstTimeSetupAccount(
      existingAdmin.id,
      {
        username: `first-time-setup-${existingAdmin.id}-${suffix}`,
        email: normalizeEmail(`first-time-setup-${existingAdmin.id}-${suffix}@deleted.local`),
      },
      context,
    );
    if (!claimed) {
      throw new ForbiddenException('First-time setup is already complete');
    }

    return existingAdmin;
  }

  public async rollbackFirstTimeSetupAdminReplacement(
    replacementUserId: number,
    existingAdmin: Pick<UserRecord, 'id' | 'username' | 'email'>,
  ): Promise<void> {
    await this.store.restoreFirstTimeSetupAccount(replacementUserId, {
      id: existingAdmin.id,
      username: existingAdmin.username,
      email: existingAdmin.email,
    });
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

  private normalizeUsernameCandidate(value: string): string {
    const cleaned = this.cleanupUsername(value)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
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
}
