import { AuthenticationType, SSOProviderType, User } from '@attraccess/database-entities';

import {
  EntityManager,
  FindOptionsWhere,
  In,
  FindOneOptions as TypeormFindOneOptions,
  Not,
  QueryFailedError,
  DataSource,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { BadRequestException, ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';

import { randomBytes } from 'crypto';

import { LicenseError, LicenseService } from '../../../license/license.service';

import { EmailService } from '../../../email/email.service';

import { TokenHashService } from '../../../encryption/token-hash.service';

import { MetricsService } from '../../../metrics/metrics.service';

import { RbacService } from '../../rbac/rbac.service';
import { z } from 'zod';
import { PaginationOptions } from '../../../types/request';

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

export type UpdateUserData = Partial<
  Pick<
    User,
    | 'externalIdentifier'
    | 'emailVerificationToken'
    | 'emailVerificationTokenExpiresAt'
    | 'isEmailVerified'
    | 'passwordResetToken'
    | 'passwordResetTokenExpiresAt'
    | 'lockedUntil'
    | 'failedLoginAttempts'
    | 'firstFailedLoginAt'
  >
>;

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
  async findOne(options: FindOneOptions, relations?: string[], manager?: EntityManager): Promise<User | null> {
    const validatedOptions = FindOneOptionsSchema.parse(options);

    // Build a where condition that uses case-insensitive comparison for username
    const whereCondition: TypeormFindOneOptions<User>['where'] = {};

    if (validatedOptions.id !== undefined) {
      whereCondition.id = validatedOptions.id;
    }

    if (validatedOptions.username !== undefined) {
      whereCondition.username = this.cleanupUsername(validatedOptions.username);
    }

    if (validatedOptions.email !== undefined) {
      whereCondition.email = validatedOptions.email;
    }

    if (validatedOptions.externalIdentifier !== undefined) {
      whereCondition.externalIdentifier = validatedOptions.externalIdentifier;
    }

    const userRepo = manager ? manager.getRepository(User) : this.userRepository;
    const user = await userRepo.findOne({
      where: whereCondition,
      relations,
    });

    return user || null;
  }

  public async isSSOUser(userId: number): Promise<boolean> {
    const ssoUser = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id = :id', { id: userId })
      .leftJoin('user.authenticationDetails', 'authenticationDetails')
      .andWhere('authenticationDetails.type = :type', { type: AuthenticationType.SSO })
      .getOne();

    return !!ssoUser;
  }

  public async findOneBySSO(providerType: SSOProviderType, providerId: number, subject: string): Promise<User | null> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.authenticationDetails', 'authenticationDetails')
      .where('authenticationDetails.type = :type', { type: AuthenticationType.SSO })
      .andWhere('authenticationDetails.providerType = :providerType', { providerType })
      .andWhere('authenticationDetails.providerId = :providerId', { providerId })
      .andWhere('authenticationDetails.ssoSubject = :subject', { subject })
      .getOne();

    return user ?? null;
  }

  async countUsers(): Promise<number> {
    return this.userRepository.count();
  }

  async findByEmailsOrUsernames(emails: string[], usernames: string[]): Promise<User[]> {
    const normalizedEmails = Array.from(new Set(emails.map((email) => email.trim()).filter((email) => email !== '')));
    const normalizedUsernames = Array.from(
      new Set(usernames.map((username) => this.cleanupUsername(username)).filter((username) => username !== '')),
    );

    const where: FindOptionsWhere<User>[] = [];

    if (normalizedEmails.length) {
      where.push({ email: In(normalizedEmails) });
    }

    if (normalizedUsernames.length) {
      where.push({ username: In(normalizedUsernames) });
    }

    if (!where.length) {
      return [];
    }

    return this.userRepository.find({ where });
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
    manager?: EntityManager,
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
    const userRepository = manager ? manager.getRepository(User) : this.userRepository;
    const currentAmountOfUsers = await userRepository.count(
      options.excludedUserIdFromLicenseUsage === undefined
        ? undefined
        : { where: { id: Not(options.excludedUserIdFromLicenseUsage) } },
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
    const existingEmail = await this.findOne({ email: data.email }, undefined, manager);
    if (existingEmail) {
      this.logger.debug(`Email already exists: ${data.email}`);
      throw new BadRequestException('Email already exists');
    }

    // Check for existing username
    this.logger.debug(`Checking if username already exists: ${data.username}`);
    const existingUsername = await this.findOne({ username: data.username }, undefined, manager);
    if (existingUsername) {
      this.logger.debug(`Username already exists: ${data.username}`);
      throw new BadRequestException('Username already exists');
    }

    const user = new User();
    user.username = data.username;
    user.email = data.email;
    user.externalIdentifier = data.externalIdentifier;
    user.isEmailVerified = data.isEmailVerified;
    if (userData.locale) {
      user.locale = userData.locale.trim() || 'en';
    }

    // Check if this is the first user in the system
    this.logger.debug('Checking if this is the first user in the system');
    const totalUsers = await userRepository.count();
    const isFirstUser = totalUsers === 0;

    this.logger.debug('Saving new user to database');
    // Wrap save + role assignment in a single transaction so a role-assignment failure
    // doesn't leave an administrator-less account on a fresh install.
    const saveUser = async (em: EntityManager) => {
      const saved = await em.save(user);
      if (isFirstUser || userData.isFirstTimeSetupAdmin) {
        this.logger.debug('First user in system - assigning administrator role');
        await this.rbacService.assignRoleByKey(saved.id, 'administrator', em);
      } else {
        await this.rbacService.assignDefaultRoles(saved.id, em);
      }
      return saved;
    };
    const savedUser = manager ? await saveUser(manager) : await this.dataSource.transaction(saveUser);
    this.logger.debug(`User saved with ID: ${savedUser.id}`);

    if (!manager) {
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
    await this.dataSource.transaction(async (manager) => {
      // This is only used for a just-created account whose verification email could not be sent.
      // It bypasses normal account-deletion rules so the first administrator can be retried.
      await manager.delete(User, userId);
    });
  }

  public async releaseFirstTimeSetupAdminIdentifiers(manager: EntityManager): Promise<User> {
    const repository = manager.getRepository(User);
    const [existingAdmin] = await repository.find({ take: 1 });
    if (!existingAdmin || existingAdmin.isEmailVerified) {
      throw new ForbiddenException('First-time setup is already complete');
    }

    const suffix = randomBytes(6).toString('base64url').slice(0, 8);
    // Claim the setup account only while it is the sole active account. The conditional
    // update is atomic across API instances, unlike an in-process mutex or count-then-update.
    const claim = await repository
      .createQueryBuilder()
      .update(User)
      .set({
        username: `first-time-setup-${existingAdmin.id}-${suffix}`,
        email: `first-time-setup-${existingAdmin.id}-${suffix}@deleted.local`,
      })
      .where('id = :id', { id: existingAdmin.id })
      .andWhere('isEmailVerified = :isEmailVerified', { isEmailVerified: false })
      .andWhere('NOT EXISTS (SELECT 1 FROM user AS other WHERE other.id != :id AND other.deletedAt IS NULL)')
      .execute();
    if (claim.affected !== 1) {
      throw new ForbiddenException('First-time setup is already complete');
    }

    return existingAdmin;
  }

  public async rollbackFirstTimeSetupAdminReplacement(replacementUserId: number, existingAdmin: User): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(User, replacementUserId);
      await manager.getRepository(User).update(existingAdmin.id, {
        username: existingAdmin.username,
        email: existingAdmin.email,
      });
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
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = (
      error as QueryFailedError & { driverError?: { code?: string | number; errno?: number; message?: string } }
    ).driverError;
    const errorCode = driverError?.code ?? driverError?.errno;
    if (
      errorCode === '23505' ||
      errorCode === 'SQLITE_CONSTRAINT' ||
      errorCode === 'SQLITE_CONSTRAINT_UNIQUE' ||
      errorCode === 'ER_DUP_ENTRY' ||
      errorCode === 1062
    ) {
      return true;
    }

    const message = driverError?.message ?? '';
    return (
      typeof message === 'string' && message.toLowerCase().includes('unique') && message.toLowerCase().includes('email')
    );
  }

  protected abstract userRepository: Repository<User>;

  protected abstract readonly logger: Logger;

  protected abstract licenseService: LicenseService;

  protected abstract readonly rbacService: RbacService;

  protected abstract dataSource: DataSource;

  protected abstract readonly metricsService: MetricsService;

  protected abstract anonymizeAndSoftDelete(id: number, manager?: EntityManager): Promise<void>;

  protected abstract emailService: EmailService;

  protected abstract applyRoleFilters(query: SelectQueryBuilder<User>, options: UserListOptions): void;

  protected abstract applySsoFilters(query: SelectQueryBuilder<User>, options: UserListOptions): void;

  protected abstract readonly tokenHashService: TokenHashService;
}
