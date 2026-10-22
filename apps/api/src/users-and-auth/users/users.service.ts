import { SettingsService } from '../../settings/settings.service';
import { DateTimePreferences, getSupportedDeviceLanguage, validateDateTimeLocale } from '@attraccess/shared';
import { User } from '@attraccess/application-models';

import { BadRequestException, Injectable, Logger, ForbiddenException } from '@nestjs/common';

import { DatabaseTransactions, TransactionScope } from '../../database/transaction-scope';
import { NewUserAccount, UserPersistence } from './persistence/port';

import { EmailService } from '../../email/email.service';

import { TokenHashService } from '../../encryption/token-hash.service';

import { UserNotFoundException } from '../../exceptions/user.notFound.exception';

import { LicenseService } from '../../license/license.service';

import { MetricsService } from '../../metrics/metrics.service';

import { RbacService } from '../rbac/rbac.service';

import { randomBytes } from 'crypto';

import { addDays } from 'date-fns';

import { UserDirectory } from './directory/user-directory';

import {
  DeleteAccountTokenExpiredException,
  DeleteAccountTokenInvalidException,
  UserHasActiveUsageSessionsException,
} from './accounts/user-accounts';

@Injectable()
export class UsersService extends UserDirectory {
  constructor(
    protected persistence: UserPersistence,
    protected transactions: DatabaseTransactions,
    protected licenseService: LicenseService,
    protected emailService: EmailService,
    protected readonly tokenHashService: TokenHashService,
    protected readonly metricsService: MetricsService,
    protected readonly rbacService: RbacService,
    protected readonly settingsService: SettingsService,
  ) {
    super();
  }

  protected readonly logger = new Logger(UsersService.name);

  async updateDateTimePreferences(userId: number, preferences: DateTimePreferences): Promise<User> {
    const validation = preferences.dateTimeLocale === null ? null : validateDateTimeLocale(preferences.dateTimeLocale);
    if (validation?.error) {
      throw new BadRequestException(`Invalid or unsupported date/time locale: ${validation.error}`);
    }
    await this.persistence.patchAccount(userId, { dateTimeLocale: validation?.locale ?? null });
    const updated = await this.findOne({ id: userId });
    if (!updated) throw new UserNotFoundException(userId);
    return updated;
  }

  async updateLocale(userId: number, locale: string): Promise<User> {
    const cleaned = locale.trim();
    if (!cleaned) {
      throw new BadRequestException('Locale cannot be empty');
    }

    const existing = await this.findOne({ id: userId });
    if (!existing) {
      throw new UserNotFoundException(userId);
    }
    const oldLocale = existing.locale ?? 'en';

    await this.persistence.patchAccount(userId, { locale: cleaned });
    this.metricsService.usersLocaleSyncsTotal.inc({ locale: cleaned });
    this.metricsService.usersPerLocale.dec({ locale: oldLocale });
    this.metricsService.usersPerLocale.inc({ locale: cleaned });

    const updated = await this.findOne({ id: userId });
    if (!updated) {
      throw new UserNotFoundException(userId);
    }
    return updated;
  }

  async withTransaction<T>(handler: (scope: TransactionScope) => Promise<T>): Promise<T> {
    return this.transactions.run({ resourceIds: [], accountIds: [] }, handler);
  }

  async ensureLicenseForNewUsers(newUsersCount: number): Promise<void> {
    if (newUsersCount <= 0) {
      return;
    }

    const currentAmountOfUsers = await this.persistence.count();
    await this.licenseService.verifyLicense({
      usageLimits: {
        users: currentAmountOfUsers + newUsersCount,
      },
    });
  }

  // The existing manager option carries the neutral parent transaction scope.
  async createMany(
    users: Array<{ username: string; email: string; locale?: string; roleKey?: string }>,
    options?: { grantAllPermissionsToFirst?: boolean; manager?: TransactionScope; actorId?: number },
  ): Promise<User[]> {
    if (users.length === 0) {
      return [];
    }

    const normalized = users.map((userData) => ({
      username: this.cleanupUsername(userData.username),
      email: userData.email.trim(),
      locale: userData.locale,
      roleKey: userData.roleKey,
    }));

    const run = async (scope: TransactionScope) => {
      const operations = this.accountOperations(scope);
      const totalExisting = await operations.count();

      const entities = normalized.map((data) => {
        this.validateUsernameOrThrow(data.username);
        if (!data.email) {
          throw new BadRequestException('Email is required');
        }

        const user: NewUserAccount = { username: data.username, email: data.email, externalIdentifier: null };
        user.username = data.username;
        user.email = data.email;
        user.externalIdentifier = null;
        user.locale = getSupportedDeviceLanguage(data.locale) ? data.locale.trim() : 'und';
        return user;
      });

      const saved = await operations.createAccounts(entities);

      // Assign administrator role to the first user when bootstrapping; default roles for everyone else.
      // Pass the transactional manager so role assignments are part of the same transaction.
      if (options?.grantAllPermissionsToFirst && totalExisting === 0 && saved.length > 0) {
        await this.rbacService.assignRoleByKey(saved[0].id, 'administrator', scope);
        for (const u of saved.slice(1)) {
          await this.rbacService.assignDefaultRoles(u.id, scope);
        }
      } else {
        for (const u of saved) {
          await this.rbacService.assignDefaultRoles(u.id, scope);
        }
      }

      // Assign per-user role keys (from CSV column mapping), in addition to default roles.
      // Privilege ceiling: if an actor is performing this import, they cannot grant a role whose
      // permissions exceed their own (mirrors the check in RbacService.assignRole).
      const anyHasRoleKey = normalized.some((n) => n.roleKey);
      const actorPermissions =
        anyHasRoleKey && options?.actorId != null
          ? await this.rbacService.getEffectivePermissions(options.actorId)
          : null;

      for (let i = 0; i < saved.length; i++) {
        const roleKey = normalized[i]?.roleKey;
        if (roleKey) {
          const role = await operations.roleForImport(roleKey);
          if (!role) {
            throw new BadRequestException(`Role with key '${roleKey}' not found`);
          }
          if (actorPermissions !== null) {
            const rolePermKeys = role.rolePermissions.map((rp) => rp.permissionKey);
            const missing = rolePermKeys.filter((k) => !actorPermissions.has(k));
            if (missing.length > 0) {
              throw new ForbiddenException('You cannot grant a role whose permissions exceed your own');
            }
          }
          await this.rbacService.assignRoleByKey(saved[i].id, roleKey, scope);
        }
      }

      return saved;
    };

    const savedUsers = await (options?.manager
      ? run(options.manager)
      : this.transactions.run({ resourceIds: [], accountIds: [] }, run));
    for (const u of savedUsers) {
      this.metricsService.usersPerLocale.inc({ locale: u.locale ?? 'en' });
    }
    return savedUsers;
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
    await this.transactions.run({ resourceIds: [], accountIds: ids }, async (scope) => {
      for (const id of ids) {
        await this.anonymizeAndSoftDelete(id, scope);
      }
    });
  }

  async requestSelfDeletion(userId: number): Promise<void> {
    const user = await this.findOne({ id: userId });
    if (!user) {
      throw new UserNotFoundException(userId);
    }

    const token = randomBytes(16).toString('base64url').slice(0, 21);
    const expiresAt = addDays(new Date(), 1);
    const storedToken = this.tokenHashService.hashToken(token);

    await this.persistence.patchAccount(user.id, {
      deleteAccountToken: storedToken,
      deleteAccountTokenExpiresAt: expiresAt,
      deleteAccountRequestedAt: new Date(),
    });

    await this.emailService.sendDeleteAccountConfirmationEmail(user, token);
  }

  async confirmSelfDeletion(email: string, token: string): Promise<void> {
    const expected = this.tokenHashService.hashToken(token);
    let user = await this.persistence.account({ email }, undefined, true);

    // The email is anonymized on deletion and may be reused, so use the retained
    // confirmation token when the email no longer identifies this confirmation.
    // Raw tokens support confirmations created before tokens were stored as hashes.
    if (!user || (user.deleteAccountToken !== expected && user.deleteAccountToken !== token)) {
      user = await this.persistence.deletedAccountByTokens([expected, token]);
    }

    if (!user) {
      throw new DeleteAccountTokenInvalidException();
    }

    if (user.deleteAccountToken !== expected && user.deleteAccountToken !== token) {
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

  protected async anonymizeAndSoftDelete(id: number, scope?: TransactionScope): Promise<void> {
    // ponytail: wrap check-then-delete in a transaction to close the TOCTOU race where two concurrent
    // deletions of the last two administrators could both pass the isLastAdministrator guard and both proceed
    const run = async (parent: TransactionScope) => {
      if (await this.rbacService.isLastAdministrator(id, parent)) {
        throw new ForbiddenException('Cannot delete the last administrator');
      }

      const operations = this.accountOperations(parent);
      const user = await operations.account({ id }, undefined, true);
      if (!user) {
        throw new UserNotFoundException(id);
      }

      if (user.deletedAt) {
        return;
      }

      const activeUsageSession = await operations.hasOpenUsage(user.id);
      if (activeUsageSession) {
        throw new UserHasActiveUsageSessionsException();
      }

      const suffix = randomBytes(6).toString('base64url').slice(0, 8);
      const anonymizedUsername = `deleted-user-${user.id}-${suffix}`;
      const anonymizedEmail = `deleted-user-${user.id}-${suffix}@deleted.local`;

      await operations.removeAuthentication(user.id);
      await operations.removeSessions(user.id);

      await operations.patchAccount(user.id, {
        username: anonymizedUsername,
        email: anonymizedEmail,
        isEmailVerified: false,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        externalIdentifier: null,
        nfcKeySeedToken: null,
        lastUsernameChangeAt: null,
      });

      await operations.softDeleteAccount(user.id);
      this.metricsService.usersPerLocale.dec({ locale: user.locale ?? 'en' });
    };

    if (scope) {
      await run(scope);
    } else {
      await this.transactions.run({ resourceIds: [], accountIds: [id] }, run);
    }
  }
}
