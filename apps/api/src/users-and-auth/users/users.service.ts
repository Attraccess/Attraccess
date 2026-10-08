import { AuthenticationDetail, ResourceUsage, Session, User, Role } from '@attraccess/database-entities';

import { BadRequestException, Injectable, Logger, ForbiddenException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, EntityManager, Repository, In, IsNull, Not } from 'typeorm';

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
    @InjectRepository(User)
    protected userRepository: Repository<User>,
    @InjectRepository(AuthenticationDetail)
    protected authenticationDetailRepository: Repository<AuthenticationDetail>,
    @InjectRepository(Session)
    protected sessionRepository: Repository<Session>,
    @InjectRepository(ResourceUsage)
    protected resourceUsageRepository: Repository<ResourceUsage>,
    protected licenseService: LicenseService,
    protected emailService: EmailService,
    protected dataSource: DataSource,
    protected readonly tokenHashService: TokenHashService,
    protected readonly metricsService: MetricsService,
    protected readonly rbacService: RbacService,
  ) {
    super();
  }

  protected readonly logger = new Logger(UsersService.name);

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

    await this.userRepository.update(userId, { locale: cleaned });
    this.metricsService.usersLocaleSyncsTotal.inc({ locale: cleaned });
    this.metricsService.usersPerLocale.dec({ locale: oldLocale });
    this.metricsService.usersPerLocale.inc({ locale: cleaned });

    const updated = await this.findOne({ id: userId });
    if (!updated) {
      throw new UserNotFoundException(userId);
    }
    return updated;
  }

  async withTransaction<T>(handler: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(handler);
  }

  async ensureLicenseForNewUsers(newUsersCount: number): Promise<void> {
    if (newUsersCount <= 0) {
      return;
    }

    const currentAmountOfUsers = await this.userRepository.count();
    await this.licenseService.verifyLicense({
      usageLimits: {
        users: currentAmountOfUsers + newUsersCount,
      },
    });
  }

  async createMany(
    users: Array<{ username: string; email: string; locale?: string; roleKey?: string }>,
    options?: { grantAllPermissionsToFirst?: boolean; manager?: EntityManager; actorId?: number },
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

    const run = async (manager: EntityManager) => {
      const repo = manager.getRepository(User);
      const totalExisting = await repo.count();

      const entities = normalized.map((data) => {
        this.validateUsernameOrThrow(data.username);
        if (!data.email) {
          throw new BadRequestException('Email is required');
        }

        const user = repo.create();
        user.username = data.username;
        user.email = data.email;
        user.externalIdentifier = null;
        if (data.locale) {
          user.locale = data.locale.trim() || 'en';
        }
        return user;
      });

      const saved = await repo.save(entities);

      // Assign administrator role to the first user when bootstrapping; default roles for everyone else.
      // Pass the transactional manager so role assignments are part of the same transaction.
      if (options?.grantAllPermissionsToFirst && totalExisting === 0 && saved.length > 0) {
        await this.rbacService.assignRoleByKey(saved[0].id, 'administrator', manager);
        for (const u of saved.slice(1)) {
          await this.rbacService.assignDefaultRoles(u.id, manager);
        }
      } else {
        for (const u of saved) {
          await this.rbacService.assignDefaultRoles(u.id, manager);
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

      const roleRepo = manager.getRepository(Role);
      for (let i = 0; i < saved.length; i++) {
        const roleKey = normalized[i]?.roleKey;
        if (roleKey) {
          const role = await roleRepo.findOne({
            where: { key: roleKey },
            relations: ['rolePermissions'],
          });
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
          await this.rbacService.assignRoleByKey(saved[i].id, roleKey, manager);
        }
      }

      return saved;
    };

    const savedUsers = await (options?.manager ? run(options.manager) : this.userRepository.manager.transaction(run));
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
    await this.userRepository.manager.transaction(async (manager) => {
      for (const id of ids) {
        await this.anonymizeAndSoftDelete(id, manager);
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

    await this.userRepository.update(user.id, {
      deleteAccountToken: storedToken,
      deleteAccountTokenExpiresAt: expiresAt,
      deleteAccountRequestedAt: new Date(),
    });

    await this.emailService.sendDeleteAccountConfirmationEmail(user, token);
  }

  async confirmSelfDeletion(email: string, token: string): Promise<void> {
    const expected = this.tokenHashService.hashToken(token);
    let user = await this.userRepository.findOne({
      where: { email },
      withDeleted: true,
    });

    // The email is anonymized on deletion and may be reused, so use the retained
    // confirmation token when the email no longer identifies this confirmation.
    // Raw tokens support confirmations created before tokens were stored as hashes.
    if (!user || (user.deleteAccountToken !== expected && user.deleteAccountToken !== token)) {
      user = await this.userRepository.findOne({
        where: {
          deleteAccountToken: In([expected, token]),
          deletedAt: Not(IsNull()),
        },
        withDeleted: true,
      });
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

  protected async anonymizeAndSoftDelete(id: number, manager?: EntityManager): Promise<void> {
    // ponytail: wrap check-then-delete in a transaction to close the TOCTOU race where two concurrent
    // deletions of the last two administrators could both pass the isLastAdministrator guard and both proceed
    const run = async (em: EntityManager) => {
      if (await this.rbacService.isLastAdministrator(id, em)) {
        throw new ForbiddenException('Cannot delete the last administrator');
      }

      const repo = em.getRepository(User);
      const authRepo = em.getRepository(AuthenticationDetail);
      const sessionRepo = em.getRepository(Session);
      const usageRepo = em.getRepository(ResourceUsage);

      const user = await repo.findOne({ where: { id }, withDeleted: true });
      if (!user) {
        throw new UserNotFoundException(id);
      }

      if (user.deletedAt) {
        return;
      }

      const activeUsageSession = await usageRepo.findOne({
        where: { userId: user.id, endTime: IsNull() },
      });
      if (activeUsageSession) {
        throw new UserHasActiveUsageSessionsException();
      }

      const suffix = randomBytes(6).toString('base64url').slice(0, 8);
      const anonymizedUsername = `deleted-user-${user.id}-${suffix}`;
      const anonymizedEmail = `deleted-user-${user.id}-${suffix}@deleted.local`;

      await authRepo.delete({ userId: user.id });
      await sessionRepo.delete({ userId: user.id });

      await repo.update(user.id, {
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

      await repo.softDelete(user.id);
      this.metricsService.usersPerLocale.dec({ locale: user.locale ?? 'en' });
    };

    if (manager) {
      await run(manager);
    } else {
      await this.dataSource.transaction(run);
    }
  }
}
