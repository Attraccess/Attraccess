import { User } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { randomBytes } from 'crypto';
import { addDays } from 'date-fns';
import { EntityManager } from 'typeorm';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { SSOUsernameChangeForbiddenException } from './errors/ssoUsernameChangeForbidden.exception';
import { UserLookupsImplementation } from './user-lookups';
import { UpdateUserData } from './users.service.feature-definitions';
export abstract class UserProfileWritingImplementation extends UserLookupsImplementation {
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
