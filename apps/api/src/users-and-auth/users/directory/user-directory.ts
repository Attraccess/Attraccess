import { User } from '@attraccess/application-models';

import { TransactionScope } from '../../../database/transaction-scope';

import { PaginationOptionsSchema } from '../../../types/request';

import { PaginatedResponse } from '../../../types/response';

import { UserListOptions, UpdateUserData, FindOneOptionsSchema } from '../accounts/user-accounts';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk/v2';

import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { isEmail } from 'class-validator';

import { randomBytes } from 'crypto';

import { addDays } from 'date-fns';

import { UserNotFoundException } from '../../../exceptions/user.notFound.exception';

import { SSOUsernameChangeForbiddenException } from '../errors/ssoUsernameChangeForbidden.exception';

import { UserAccounts } from '../accounts/user-accounts';

export abstract class UserDirectory extends UserAccounts {
  /** Resolve the identifier accepted by local login without ambiguous username/email queries. */
  async findByLoginIdentifier(identifier: string): Promise<User | null> {
    const value = identifier.trim();
    if (!value) return null;

    const options = value.includes('@') ? { email: value } : { username: value };
    const parsed = FindOneOptionsSchema.safeParse(options);
    if (!parsed.success) return null;

    if (parsed.data.email !== undefined) {
      // Preserve distinct existing accounts whose addresses differ only by case.
      const exactMatch = await this.persistence.account({ email: parsed.data.email });
      if (exactMatch) return exactMatch;

      // Fall back only when case-insensitive matching identifies one account.
      // Equality keeps underscores literal, unlike a LIKE query.
      const matches = await this.persistence.caseInsensitiveEmailMatches(parsed.data.email);
      return matches.length === 1 ? matches[0] : null;
    }
    return this.findOne(parsed.data);
  }

  async findMany(options: UserListOptions): Promise<PaginatedResponse<User>> {
    this.logger.debug(`Finding all users with options: ${JSON.stringify(options)}`);
    const paginationOptions = PaginationOptionsSchema.parse(options);
    const { page, limit } = paginationOptions;

    if (Array.isArray(options.ids) && options.ids.length === 0) {
      return {
        data: [],
        total: 0,
        page: paginationOptions.page,
        limit: paginationOptions.limit,
      };
    }

    return this.persistence.page({ ...options, page, limit });
  }

  async updateOne(id: number, updateData: UpdateUserData, scope?: TransactionScope): Promise<User> {
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
    const operations = this.accountOperations(scope);

    this.logger.debug(`Performing update for user ID: ${id}`);
    await operations.patchAccount(id, updates);

    this.logger.debug(`Fetching updated user from database, ID: ${id}`);
    const updatedUser = await this.findOne({ id }, undefined, scope);
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

    await this.persistence.patchAccount(targetUserId, {
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
      return await this.transactions.run({ resourceIds: [], accountIds: [targetUserId] }, async (scope) => {
        const operations = this.accountOperations(scope);

        await operations.patchAccount(targetUserId, {
          email: trimmedEmail,
          isEmailVerified: false,
          emailVerificationToken: token,
          emailVerificationTokenExpiresAt: expiresAt,
        });

        const updated = await this.findOne({ id: targetUserId }, undefined, scope);
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

    await this.persistence.patchAccount(targetUserId, { billingFactor: newBillingFactor });

    const updatedUser = await this.findOne({ id: targetUserId });
    if (!updatedUser) {
      throw new UserNotFoundException(targetUserId);
    }

    return updatedUser;
  }
}
