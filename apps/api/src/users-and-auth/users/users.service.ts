import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { DateTimePreferences, getSupportedDeviceLanguage, validateDateTimeLocale } from '@attraccess/shared';
import type { SSOProviderType, UserAccount, UserRecord } from '@attraccess/application-models';

import { BadRequestException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';

import { EmailService } from '../../email/email.service';

import { TokenHashService } from '../../encryption/token-hash.service';

import { UserNotFoundException } from '../../exceptions/user.notFound.exception';

import { LicenseService } from '../../license/license.service';

import { MetricsService } from '../../metrics/metrics.service';

import { RbacService } from '../rbac/rbac.service';
import { RBAC_STORE, type RbacStore } from '../rbac/rbac.port';

import { randomBytes } from 'crypto';

import { addDays } from 'date-fns';

import type { TransactionContext } from '../../database/transaction-context';
import { UNIT_OF_WORK, type TransactionScope, type UnitOfWork } from '../../database/unit-of-work';

import { UserDirectory } from './directory/user-directory';

import { UserAccounts } from './accounts/user-accounts';
import { normalizeUserName } from './accounts/normalize-name';
import { normalizeEmail } from './accounts/normalize-email';

import {
  DeleteAccountTokenExpiredException,
  DeleteAccountTokenInvalidException,
  FindOneOptions,
  identityTakenException,
  UpdateUserData,
  UserHasActiveUsageSessionsException,
  UserListOptions,
} from './accounts/user-accounts';

import { USER_STORE, UserIdentityTakenError, type UserStore } from './user-store.port';

import { PaginatedResponse } from '../../types/response';

/**
 * User accounts: creation, lookup, identity changes, preferences and deletion. Lookup and creation live in
 * {@link UserAccounts}, listing and identity changes in {@link UserDirectory}; this service is their entry point.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_STORE) private readonly store: UserStore,
    private readonly licenseService: LicenseService,
    private readonly emailService: EmailService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly tokenHashService: TokenHashService,
    private readonly metricsService: MetricsService,
    private readonly rbacService: RbacService,
    private readonly accounts: UserAccounts,
    private readonly directory: UserDirectory,
    @Inject(RBAC_STORE) private readonly rbacStore: RbacStore,
  ) {}

  private readonly logger = new Logger(UsersService.name);

  async findOne(
    options: FindOneOptions,
    relations?: readonly string[],
    context?: TransactionContext,
  ): Promise<UserAccount | null> {
    return this.accounts.findOne(options, relations, context);
  }

  public async isSSOUser(userId: number): Promise<boolean> {
    return this.accounts.isSSOUser(userId);
  }

  public async findOneBySSO(
    providerType: SSOProviderType,
    providerId: number,
    subject: string,
  ): Promise<UserAccount | null> {
    return this.accounts.findOneBySSO(providerType, providerId, subject);
  }

  async countUsers(): Promise<number> {
    return this.accounts.countUsers();
  }

  async findByEmailsOrUsernames(emails: string[], usernames: string[]): Promise<UserRecord[]> {
    return this.accounts.findByEmailsOrUsernames(emails, usernames);
  }

  async createOne(
    userData: Parameters<UserAccounts['createOne']>[0],
    context?: TransactionContext,
    options: { excludedUserIdFromLicenseUsage?: number } = {},
  ): Promise<UserRecord> {
    return this.accounts.createOne(userData, context, options);
  }

  public recordCreatedUser(user: Pick<UserRecord, 'locale'>): void {
    this.accounts.recordCreatedUser(user);
  }

  public async rollbackFailedRegistration(userId: number): Promise<void> {
    return this.accounts.rollbackFailedRegistration(userId);
  }

  public async releaseFirstTimeSetupAdminIdentifiers(context?: TransactionContext): Promise<UserRecord> {
    return this.accounts.releaseFirstTimeSetupAdminIdentifiers(context);
  }

  public async rollbackFirstTimeSetupAdminReplacement(
    replacementUserId: number,
    existingAdmin: Pick<UserRecord, 'id' | 'username' | 'email'>,
  ): Promise<void> {
    return this.accounts.rollbackFirstTimeSetupAdminReplacement(replacementUserId, existingAdmin);
  }

  public validateUsernameOrThrow(username: string): void {
    this.accounts.validateUsernameOrThrow(username);
  }

  public cleanupUsername(username: string): string {
    return this.accounts.cleanupUsername(username);
  }

  public buildUsernameFromSSOClaim(rawUsername?: string | null, fallback?: string): string {
    return this.accounts.buildUsernameFromSSOClaim(rawUsername, fallback);
  }

  /** Resolve the identifier accepted by local login without ambiguous username/email queries. */
  async findByLoginIdentifier(identifier: string): Promise<UserAccount | null> {
    return this.directory.findByLoginIdentifier(identifier);
  }

  async findMany(options: UserListOptions): Promise<PaginatedResponse<UserAccount>> {
    return this.directory.findMany(options);
  }

  async updateOne(id: number, updateData: UpdateUserData, context?: TransactionContext): Promise<UserAccount> {
    return this.directory.updateOne(id, updateData, context);
  }

  async changeUsername(targetUserId: number, newUsername: string, executingUser: { id: number }): Promise<UserAccount> {
    return this.directory.changeUsername(targetUserId, newUsername, executingUser);
  }

  async changeName(
    targetUserId: number,
    name: { firstName?: string | null; lastName?: string | null },
  ): Promise<UserAccount> {
    return this.directory.changeName(targetUserId, name);
  }

  async changeEmail(targetUserId: number, newEmail: string, executingUser: { id: number }): Promise<UserAccount> {
    return this.directory.changeEmail(targetUserId, newEmail, executingUser);
  }

  async changeBillingFactor(targetUserId: number, newBillingFactor: number): Promise<UserAccount> {
    return this.directory.changeBillingFactor(targetUserId, newBillingFactor);
  }

  async updateDateTimePreferences(userId: number, preferences: DateTimePreferences): Promise<UserAccount> {
    const validation = preferences.dateTimeLocale === null ? null : validateDateTimeLocale(preferences.dateTimeLocale);
    if (validation?.error) {
      throw new BadRequestException(`Invalid or unsupported date/time locale: ${validation.error}`);
    }
    await this.store.updateUser(userId, { dateTimeLocale: validation?.locale ?? null });
    const updated = await this.accounts.findOne({ id: userId });
    if (!updated) throw new UserNotFoundException(userId);
    return updated;
  }

  async updateLocale(userId: number, locale: string): Promise<UserAccount> {
    const cleaned = locale.trim();
    if (!cleaned) {
      throw new BadRequestException('Locale cannot be empty');
    }

    const existing = await this.accounts.findOne({ id: userId });
    if (!existing) {
      throw new UserNotFoundException(userId);
    }
    const oldLocale = existing.locale ?? 'en';

    await this.store.updateUser(userId, { locale: cleaned });
    this.metricsService.usersLocaleSyncsTotal.inc({ locale: cleaned });
    this.metricsService.usersPerLocale.dec({ locale: oldLocale });
    this.metricsService.usersPerLocale.inc({ locale: cleaned });

    const updated = await this.accounts.findOne({ id: userId });
    if (!updated) {
      throw new UserNotFoundException(userId);
    }
    return updated;
  }

  /**
   * Single use: clears the user's stored verification token and marks the email verified. False when another
   * request consumed the token first (or it was replaced).
   */
  async consumeEmailVerificationToken(userId: number, storedToken: string): Promise<boolean> {
    return this.store.consumeEmailVerificationToken(userId, storedToken);
  }

  /** Single use, like {@link consumeEmailVerificationToken}, for the password reset token. */
  async consumePasswordResetToken(userId: number, storedToken: string): Promise<boolean> {
    return this.store.consumePasswordResetToken(userId, storedToken);
  }

  async withTransaction<T>(handler: (scope: TransactionScope) => Promise<T>): Promise<T> {
    return this.uow.run(handler);
  }

  async ensureLicenseForNewUsers(newUsersCount: number): Promise<void> {
    if (newUsersCount <= 0) {
      return;
    }

    const currentAmountOfUsers = await this.store.countUsers();
    await this.licenseService.verifyLicense({
      usageLimits: {
        // like createOne, pass the count before the last new user is added: verifyLicense refuses usage >= limit,
        // so the total may reach the limit but not exceed it
        users: currentAmountOfUsers + newUsersCount - 1,
      },
    });
  }

  async createMany(
    users: Array<{
      username: string;
      firstName?: string | null;
      lastName?: string | null;
      email: string;
      locale?: string;
      roleKey?: string;
    }>,
    options?: { grantAllPermissionsToFirst?: boolean; context?: TransactionContext; actor?: AuthenticatedUser },
  ): Promise<UserRecord[]> {
    if (users.length === 0) {
      return [];
    }

    const normalized = users.map((userData) => ({
      username: this.accounts.cleanupUsername(userData.username),
      firstName: normalizeUserName(userData.firstName),
      lastName: normalizeUserName(userData.lastName),
      email: normalizeEmail(userData.email),
      locale: userData.locale,
      roleKey: userData.roleKey,
    }));

    const run = async (context: TransactionContext) => {
      // Like a single registration: only one creation at a time may see the installation empty.
      await this.store.lockAccountCreation(context);
      const totalExisting = await this.store.countUsers({}, context);

      const newUsers = normalized.map((data) => {
        this.accounts.validateUsernameOrThrow(data.username);
        if (!data.email) {
          throw new BadRequestException('Email is required');
        }

        return {
          username: data.username,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          externalIdentifier: null,
          isEmailVerified: false,
          locale: getSupportedDeviceLanguage(data.locale) ? data.locale.trim() : 'und',
        };
      });

      const saved = await this.store.insertUsers(newUsers, context).catch((error: unknown) => {
        // A concurrent write took an identity after the caller's existence check.
        throw error instanceof UserIdentityTakenError ? identityTakenException(error.field) : error;
      });

      // Assign administrator role to the first user when bootstrapping; default roles for everyone else.
      // Pass the transaction so role assignments are part of the same unit of work.
      if (options?.grantAllPermissionsToFirst && totalExisting === 0 && saved.length > 0) {
        await this.rbacService.assignRoleByKey(saved[0].id, 'administrator', context);
        for (const u of saved.slice(1)) {
          await this.rbacService.assignDefaultRoles(u.id, context);
        }
      } else {
        for (const u of saved) {
          await this.rbacService.assignDefaultRoles(u.id, context);
        }
      }

      // Assign per-user role keys (from CSV column mapping), in addition to default roles.
      // Privilege ceiling: if an actor is performing this import, they cannot grant a role whose
      // permissions exceed their own (mirrors the check in RbacService.assignRole).
      const anyHasRoleKey = normalized.some((n) => n.roleKey);
      const actorPermissions =
        anyHasRoleKey && options?.actor ? await this.rbacService.getGrantCeiling(options.actor) : null;

      for (let i = 0; i < saved.length; i++) {
        const roleKey = normalized[i]?.roleKey;
        if (roleKey) {
          const role = await this.rbacStore.findRoleByKey(roleKey, context, { withPermissions: true });
          if (!role) {
            throw new BadRequestException(`Role with key '${roleKey}' not found`);
          }
          if (actorPermissions !== null) {
            const rolePermKeys = (role.rolePermissions ?? []).map((rp) => rp.permissionKey);
            const missing = rolePermKeys.filter((k) => !actorPermissions.has(k));
            if (missing.length > 0) {
              throw new ForbiddenException('You cannot grant a role whose permissions exceed your own');
            }
          }
          await this.rbacService.assignRoleByKey(saved[i].id, roleKey, context);
        }
      }

      return saved;
    };

    const savedUsers = await (options?.context ? run(options.context) : this.uow.run(run));
    for (const u of savedUsers) {
      this.metricsService.usersPerLocale.inc({ locale: u.locale ?? 'en' });
    }
    return savedUsers;
  }

  /**
   * Removes invited users whose invitation email could not be sent, unless they already accepted it. They were created
   * moments ago, so nothing else refers to them yet; their role assignments cascade.
   */
  async deleteUnacceptedInvitations(ids: number[]): Promise<void> {
    await this.store.discardUnacceptedInvitations(ids);
  }

  async deleteOne(id: number): Promise<void> {
    this.logger.debug(`Deleting user with ID: ${id}`);
    await this.anonymizeAndSoftDelete(id);
    this.metricsService.usersTotal.dec();
    this.logger.debug(`User deleted with ID: ${id}`);
  }

  async deleteMany(ids: number[]): Promise<void> {
    if (!ids.length) {
      return;
    }
    await this.uow.run(async (scope) => {
      for (const id of ids) {
        await this.anonymizeAndSoftDelete(id, scope);
      }
    });
  }

  async requestSelfDeletion(userId: number): Promise<void> {
    const user = await this.accounts.findOne({ id: userId });
    if (!user) {
      throw new UserNotFoundException(userId);
    }

    const token = randomBytes(16).toString('base64url').slice(0, 21);

    await this.store.recordDeleteAccountRequest(user.id, {
      tokenHash: this.tokenHashService.hashToken(token),
      expiresAt: addDays(new Date(), 1),
      requestedAt: new Date(),
    });

    await this.emailService.sendDeleteAccountConfirmationEmail(user, token);
  }

  async confirmSelfDeletion(email: string, token: string): Promise<void> {
    const expected = this.tokenHashService.hashToken(token);
    // Raw tokens support confirmations created before tokens were stored as hashes.
    const user = await this.store.findForDeletionConfirmation(normalizeEmail(email), [expected, token]);

    if (!user || (user.deleteAccountToken !== expected && user.deleteAccountToken !== token)) {
      throw new DeleteAccountTokenInvalidException();
    }

    if (!user.deleteAccountTokenExpiresAt || user.deleteAccountTokenExpiresAt < new Date()) {
      throw new DeleteAccountTokenExpiredException();
    }

    if (user.deletedAt) {
      return;
    }

    await this.anonymizeAndSoftDelete(user.id);
  }

  private async anonymizeAndSoftDelete(id: number, context?: TransactionContext): Promise<void> {
    // ponytail: wrap check-then-delete in a transaction to close the TOCTOU race where two concurrent
    // deletions of the last two administrators could both pass the isLastAdministrator guard and both proceed
    const run = async (transaction: TransactionContext) => {
      if (await this.rbacService.isLastAdministrator(id, transaction)) {
        throw new ForbiddenException('Cannot delete the last administrator');
      }

      const suffix = randomBytes(6).toString('base64url').slice(0, 8);
      const result = await this.store.anonymizeUser(
        id,
        {
          username: `deleted-user-${id}-${suffix}`,
          email: normalizeEmail(`deleted-user-${id}-${suffix}@deleted.local`),
        },
        transaction,
      );

      switch (result.outcome) {
        case 'not-found':
          throw new UserNotFoundException(id);
        case 'active-usage':
          throw new UserHasActiveUsageSessionsException();
        case 'already-deleted':
          return;
        case 'anonymized':
          this.metricsService.usersPerLocale.dec({ locale: result.locale ?? 'en' });
      }
    };

    if (context) {
      await run(context);
    } else {
      await this.uow.run(run);
    }
  }
}
