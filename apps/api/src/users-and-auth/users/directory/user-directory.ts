import { User, AuthenticationDetail, AuthenticationType, UserRole } from '@attraccess/database-entities';

import { Brackets, FindOptionsWhere, ILike, In, SelectQueryBuilder, EntityManager } from 'typeorm';

import { PaginationOptionsSchema } from '../../../types/request';

import { PaginatedResponse } from '../../../types/response';

import { UserListOptions, UpdateUserData } from '../accounts/user-accounts';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { isEmail } from 'class-validator';

import { randomBytes } from 'crypto';

import { addDays } from 'date-fns';

import { UserNotFoundException } from '../../../exceptions/user.notFound.exception';

import { SSOUsernameChangeForbiddenException } from '../errors/ssoUsernameChangeForbidden.exception';

import { UserAccounts } from '../accounts/user-accounts';

export abstract class UserDirectory extends UserAccounts {
  async findMany(options: UserListOptions): Promise<PaginatedResponse<User>> {
    this.logger.debug(`Finding all users with options: ${JSON.stringify(options)}`);
    const paginationOptions = PaginationOptionsSchema.parse(options);
    const { search } = options;
    const { page, limit } = paginationOptions;
    const skip = (page - 1) * limit;

    if (Array.isArray(options.ids) && options.ids.length === 0) {
      return {
        data: [],
        total: 0,
        page: paginationOptions.page,
        limit: paginationOptions.limit,
      };
    }

    const hasAdvancedFilters =
      options.roleIds !== undefined ||
      options.excludeRoleIds !== undefined ||
      options.emailVerified !== undefined ||
      options.ssoProviderIds !== undefined ||
      options.excludeSsoProviderIds !== undefined ||
      options.ssoProviderNone !== undefined ||
      options.hasSsoProvider !== undefined;

    if (hasAdvancedFilters) {
      const query = this.userRepository.createQueryBuilder('user');
      query.leftJoinAndSelect('user.authenticationDetails', 'authenticationDetails');

      if (options.includeRoles) {
        query.leftJoinAndSelect('user.userRoles', 'userRoles').leftJoinAndSelect('userRoles.role', 'role');
      }

      if (options.ids) {
        query.andWhere('user.id IN (:...ids)', { ids: options.ids });
      }

      if (options.emailVerified !== undefined) {
        query.andWhere('user.isEmailVerified = :emailVerified', { emailVerified: options.emailVerified });
      }

      this.applyRoleFilters(query, options);

      this.applySsoFilters(query, options);

      if (search) {
        this.logger.debug(`Searching for users with query: ${search}`);
        query.andWhere(
          new Brackets((where) =>
            where.where('LOWER(user.username) LIKE LOWER(:search)').orWhere('LOWER(user.email) LIKE LOWER(:search)'),
          ),
          { search: `%${search}%` },
        );
      }

      const [users, total] = await query.orderBy('user.username', 'ASC').skip(skip).take(limit).getManyAndCount();
      return { data: users, total, page, limit };
    }

    let whereCondition: FindOptionsWhere<User>[] | FindOptionsWhere<User> = {};

    if (Array.isArray(options.ids)) {
      whereCondition = { id: In(options.ids) };
    }

    if (options.roleId !== undefined) {
      whereCondition = { ...whereCondition, userRoles: { roleId: options.roleId } };
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
      relations: options.includeRoles
        ? ['authenticationDetails', 'userRoles', 'userRoles.role']
        : ['authenticationDetails'],
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

  protected applyRoleFilters(query: SelectQueryBuilder<User>, options: UserListOptions): void {
    const requestedRoleIds = options.roleIds ?? (options.roleId === undefined ? undefined : [options.roleId]);
    const roleIds = requestedRoleIds ? [...new Set(requestedRoleIds)] : undefined;
    if (roleIds?.length) {
      const roleFilter = query
        .subQuery()
        .select('userRole.userId')
        .from(UserRole, 'userRole')
        .where('userRole.roleId IN (:...roleIds)');

      if (options.roleMatch === 'all') {
        roleFilter.groupBy('userRole.userId').having('COUNT(DISTINCT userRole.roleId) = :roleCount');
        query.andWhere(`user.id IN ${roleFilter.getQuery()}`, { roleIds, roleCount: roleIds.length });
      } else {
        query.andWhere(`user.id IN ${roleFilter.getQuery()}`, { roleIds });
      }
    }

    const excludeRoleIds = options.excludeRoleIds ? [...new Set(options.excludeRoleIds)] : undefined;
    if (excludeRoleIds?.length) {
      const excludedRoles = query
        .subQuery()
        .select('1')
        .from(UserRole, 'excludedUserRole')
        .where('excludedUserRole.userId = user.id')
        .andWhere('excludedUserRole.roleId IN (:...excludeRoleIds)');
      query.andWhere(`NOT EXISTS ${excludedRoles.getQuery()}`, { excludeRoleIds });
    }
  }

  protected applySsoFilters(query: SelectQueryBuilder<User>, options: UserListOptions): void {
    const ssoProviderIds = options.ssoProviderIds ? [...new Set(options.ssoProviderIds)] : undefined;
    if (ssoProviderIds?.length || options.ssoProviderNone) {
      const noSsoProvider = query
        .subQuery()
        .select('1')
        .from(AuthenticationDetail, 'ssoDetail')
        .where('ssoDetail.userId = user.id')
        .andWhere('ssoDetail.type = :ssoType')
        .getQuery();
      const ssoProviders = ssoProviderIds?.length
        ? query
            .subQuery()
            .select('ssoDetail.userId')
            .from(AuthenticationDetail, 'ssoDetail')
            .where('ssoDetail.userId = user.id')
            .andWhere('ssoDetail.type = :ssoType')
            .andWhere('ssoDetail.providerId IN (:...ssoProviderIds)')
        : undefined;

      if (ssoProviders && options.ssoProviderMatch === 'all') {
        ssoProviders.groupBy('ssoDetail.userId').having('COUNT(DISTINCT ssoDetail.providerId) = :ssoProviderCount');
      }

      if (ssoProviders && options.ssoProviderNone && options.ssoProviderMatch !== 'all') {
        query.andWhere(
          new Brackets((where) =>
            where.where(`user.id IN ${ssoProviders.getQuery()}`).orWhere(`NOT EXISTS ${noSsoProvider}`),
          ),
        );
      } else if (ssoProviders) {
        query.andWhere(`user.id IN ${ssoProviders.getQuery()}`);
        if (options.ssoProviderNone) {
          query.andWhere(`NOT EXISTS ${noSsoProvider}`);
        }
      } else {
        query.andWhere(`NOT EXISTS ${noSsoProvider}`);
      }

      query.setParameters({
        ssoType: AuthenticationType.SSO,
        ...(ssoProviderIds?.length ? { ssoProviderIds, ssoProviderCount: ssoProviderIds.length } : {}),
      });
    }

    if (options.hasSsoProvider !== undefined) {
      const ssoProviderExists = query
        .subQuery()
        .select('1')
        .from(AuthenticationDetail, 'anySsoDetail')
        .where('anySsoDetail.userId = user.id')
        .andWhere('anySsoDetail.type = :anySsoType');
      query.andWhere(`${options.hasSsoProvider ? 'EXISTS' : 'NOT EXISTS'} ${ssoProviderExists.getQuery()}`, {
        anySsoType: AuthenticationType.SSO,
      });
    }

    const excludeSsoProviderIds = options.excludeSsoProviderIds
      ? [...new Set(options.excludeSsoProviderIds)]
      : undefined;
    if (excludeSsoProviderIds?.length) {
      const excludedSsoProviders = query
        .subQuery()
        .select('1')
        .from(AuthenticationDetail, 'excludedSsoDetail')
        .where('excludedSsoDetail.userId = user.id')
        .andWhere('excludedSsoDetail.type = :excludedSsoType')
        .andWhere('excludedSsoDetail.providerId IN (:...excludeSsoProviderIds)');
      query.andWhere(`NOT EXISTS ${excludedSsoProviders.getQuery()}`, {
        excludedSsoType: AuthenticationType.SSO,
        excludeSsoProviderIds,
      });
    }
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
}
