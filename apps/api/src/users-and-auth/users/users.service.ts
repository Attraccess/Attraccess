import { BadRequestException, Injectable, Logger, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  Repository,
  ILike,
  FindOneOptions as TypeormFindOneOptions,
  FindOptionsWhere,
  In,
  EntityManager,
} from 'typeorm';
import {
  AuthenticationDetail,
  AuthenticationType,
  ResourceUsage,
  Role,
  Session,
  User,
  SSOProviderType,
} from '@attraccess/database-entities';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedResponse } from '../../types/response';
import { PaginationOptions, PaginationOptionsSchema } from '../../types/request';
import { z } from 'zod';
import { isEmail } from 'class-validator';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { LicenseError, LicenseService } from '../../license/license.service';
import { EmailService } from '../../email/email.service';
import { DataSource, IsNull, Not, QueryFailedError } from 'typeorm';
import { SSOUsernameChangeForbiddenException } from './errors/ssoUsernameChangeForbidden.exception';
import { addDays } from 'date-fns';
import { randomBytes } from 'crypto';
import { TokenHashService } from '../../encryption/token-hash.service';
import { MetricsService } from '../../metrics/metrics.service';
import { RbacService } from '../rbac/rbac.service';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

class DeleteAccountTokenInvalidException extends BadRequestException {
  constructor() {
    super('DeleteAccountTokenInvalidException');
  }
}

class DeleteAccountTokenExpiredException extends UnauthorizedException {
  constructor() {
    super('DeleteAccountTokenExpiredException');
  }
}

class UserHasActiveUsageSessionsException extends BadRequestException {
  constructor() {
    super('UserHasActiveUsageSessions');
  }
}

type UpdateUserData = Partial<
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

const FindOneOptionsSchema = z
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

type FindOneOptions = z.infer<typeof FindOneOptionsSchema>;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AuthenticationDetail)
    private authenticationDetailRepository: Repository<AuthenticationDetail>,
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    @InjectRepository(ResourceUsage)
    private resourceUsageRepository: Repository<ResourceUsage>,
    private licenseService: LicenseService,
    private emailService: EmailService,
    private dataSource: DataSource,
    private readonly tokenHashService: TokenHashService,
    private readonly metricsService: MetricsService,
    private readonly rbacService: RbacService,
  ) {}

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

  private isEmailUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = (error as QueryFailedError & { driverError?: { code?: string | number; errno?: number; message?: string } })
      .driverError;
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
    return typeof message === 'string' && message.toLowerCase().includes('unique') && message.toLowerCase().includes('email');
  }

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

  async createOne(userData: {
    username: string;
    email: string;
    externalIdentifier: string | null;
    isEmailVerified?: boolean;
    skipUsernameSanitization?: boolean;
    locale?: string;
  }, manager?: EntityManager): Promise<User> {
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
    const currentAmountOfUsers = await userRepository.count();
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
      if (isFirstUser) {
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

  async deleteOne(id: number): Promise<void> {
    this.logger.debug(`Deleting user with ID: ${id}`);
    await this.anonymizeAndSoftDelete(id);
    this.metricsService.usersTotal.dec();
    this.logger.debug(`User deleted with ID: ${id}`);
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

  async updateOne(id: number, updateData: UpdateUserData, manager?: EntityManager): Promise<User> {
    const updates: UpdateUserData = {
      externalIdentifier: updateData.externalIdentifier?.trim() ?? undefined,
      emailVerificationToken: updateData.emailVerificationToken?.trim() ?? undefined,
      emailVerificationTokenExpiresAt: updateData.emailVerificationTokenExpiresAt ?? undefined,
      isEmailVerified: updateData.isEmailVerified ?? undefined,
      passwordResetToken: updateData.passwordResetToken?.trim() ?? undefined,
      passwordResetTokenExpiresAt: updateData.passwordResetTokenExpiresAt ?? undefined,
      lockedUntil: 'lockedUntil' in updateData ? updateData.lockedUntil : undefined,
      failedLoginAttempts: updateData.failedLoginAttempts ?? undefined,
      firstFailedLoginAt: 'firstFailedLoginAt' in updateData ? updateData.firstFailedLoginAt : undefined,
    };
    this.logger.debug(`Updating user with ID: ${id}, updates: ${JSON.stringify(updates)}`);

    // If email is being updated, check for uniqueness
    const userRepo = manager ? manager.getRepository(User) : this.userRepository;

    this.logger.debug(`Performing update for user ID: ${id}`);
    await userRepo.update(id, updates);

    this.logger.debug(`Fetching updated user from database, ID: ${id}`);
    const updatedUser = await this.findOne({ id }, undefined, manager);
    if (!updatedUser) {
      this.logger.error(`User not found after update, ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    this.logger.debug(`User updated successfully, ID: ${id}`);
    return updatedUser;
  }

  async changeUsername(targetUserId: number, newUsername: string, executingUser: User): Promise<User> {
    const isSSOUser = await this.isSSOUser(targetUserId);
    if (isSSOUser) {
      throw new SSOUsernameChangeForbiddenException();
    }

    newUsername = this.cleanupUsername(newUsername);
    if (newUsername.length === 0) {
      throw new BadRequestException('Username cannot be empty');
    }

    const targetUser = await this.findOne({ id: targetUserId });
    if (!targetUser) {
      throw new UserNotFoundException(targetUserId);
    }

    this.validateUsernameOrThrow(newUsername);

    const isSelf = executingUser.id === targetUserId;
    const canUpdateUsers = !!(executingUser as AuthenticatedUser).effectivePermissions?.has('users.update');

    if (!isSelf && !canUpdateUsers) {
      throw new ForbiddenException("You do not have permission to change this user's username");
    }

    // Apply once-per-day restriction only when changing own username
    if (isSelf && !canUpdateUsers) {
      const now = new Date();
      if (targetUser.lastUsernameChangeAt) {
        const msSince = now.getTime() - new Date(targetUser.lastUsernameChangeAt).getTime();
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (msSince < oneDayMs) {
          throw new BadRequestException('Username can only be changed once per day');
        }
      }
    }

    const oldUsername = targetUser.username;

    const lastUsernameChangeAt = isSelf ? new Date() : undefined;

    await this.userRepository.update(targetUserId, {
      username: newUsername,
      ...(lastUsernameChangeAt ? { lastUsernameChangeAt } : {}),
    });

    const updated = await this.findOne({ id: targetUserId });
    if (!updated) {
      throw new UserNotFoundException(targetUserId);
    }

    try {
      await this.emailService.sendUsernameChangedEmail(updated, oldUsername);
    } catch (e) {
      this.logger.error('Failed to send username changed email', (e as Error).stack);
    }
    return updated;
  }

  async changeEmail(targetUserId: number, newEmail: string, executingUser: User): Promise<User> {
    const trimmedEmail = (newEmail ?? '').trim();
    if (!trimmedEmail) {
      throw new BadRequestException('Email cannot be empty');
    }
    if (!isEmail(trimmedEmail)) {
      throw new BadRequestException('Invalid email');
    }

    const targetUser = await this.findOne({ id: targetUserId });
    if (!targetUser) {
      throw new UserNotFoundException(targetUserId);
    }

    const isSelf = executingUser.id === targetUserId;
    const canUpdateUsers = !!(executingUser as AuthenticatedUser).effectivePermissions?.has('users.update');

    if (!isSelf && !canUpdateUsers) {
      throw new ForbiddenException("You do not have permission to change this user's email");
    }

    if (targetUser.email.trim() === trimmedEmail) {
      return targetUser;
    }

    const existingEmail = await this.findOne({ email: trimmedEmail });
    if (existingEmail && existingEmail.id !== targetUserId) {
      throw new BadRequestException('Email already exists');
    }

    const token = randomBytes(16).toString('base64url').slice(0, 21);
    const expiresAt = addDays(new Date(), 3);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);

        await userRepo.update(targetUserId, {
          email: trimmedEmail,
          isEmailVerified: false,
          emailVerificationToken: token,
          emailVerificationTokenExpiresAt: expiresAt,
        });

        const updated = await this.findOne({ id: targetUserId }, undefined, manager);
        if (!updated) {
          throw new UserNotFoundException(targetUserId);
        }

        await this.emailService.sendVerificationEmail(updated, token);
        return updated;
      });
    } catch (error) {
      if (this.isEmailUniqueConstraintViolation(error)) {
        throw new BadRequestException('Email already exists');
      }
      throw error;
    }
  }

  async findMany(options: PaginationOptions & { search?: string; ids?: number[]; includeRoles?: boolean }): Promise<PaginatedResponse<User>> {
    this.logger.debug(`Finding all users with options: ${JSON.stringify(options)}`);
    const paginationOptions = PaginationOptionsSchema.parse(options);
    const { search } = options;
    const { page, limit } = paginationOptions;
    const skip = (page - 1) * limit;

    let whereCondition: FindOptionsWhere<User>[] | FindOptionsWhere<User> = {};

    if (Array.isArray(options.ids)) {
      if (options.ids.length === 0) {
        return {
          data: [],
          total: 0,
          page: paginationOptions.page,
          limit: paginationOptions.limit,
        };
      }

      whereCondition = { id: In(options.ids) };
    }

    if (search) {
      this.logger.debug(`Searching for users with query: ${search}`);
      whereCondition = [
        { ...whereCondition, username: ILike(`%${search}%`) },
        { ...whereCondition, email: ILike(`%${search}%`) },
      ];
    }

    this.logger.debug(`Executing find with skip: ${skip}, take: ${limit}`);
    const [users, total] = await this.userRepository.findAndCount({
      skip,
      take: limit,
      where: whereCondition,
      relations: options.includeRoles ? ['authenticationDetails', 'userRoles', 'userRoles.role'] : ['authenticationDetails'],
      order: { username: 'ASC' },
    });

    this.logger.debug(`Found ${total} total users, returning page ${page} with ${users.length} results`);
    return {
      data: users,
      total,
      page: paginationOptions.page,
      limit: paginationOptions.limit,
    };
  }

  async changeBillingFactor(targetUserId: number, newBillingFactor: number): Promise<User> {
    const targetUser = await this.findOne({ id: targetUserId });
    if (!targetUser) {
      throw new UserNotFoundException(targetUserId);
    }

    if (newBillingFactor < 0) {
      throw new BadRequestException('Billing factor must be at least 0');
    }

    await this.userRepository.update(targetUserId, { billingFactor: newBillingFactor });

    const updatedUser = await this.findOne({ id: targetUserId });
    if (!updatedUser) {
      throw new UserNotFoundException(targetUserId);
    }

    return updatedUser;
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

  private async anonymizeAndSoftDelete(id: number, manager?: EntityManager): Promise<void> {
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
}
