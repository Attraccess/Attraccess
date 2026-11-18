import type { UserAccount } from '@attraccess/application-models';

import { PaginationOptionsSchema } from '../../../types/request';

import { PaginatedResponse } from '../../../types/response';

import { UserListOptions, UpdateUserData, FindOneOptionsSchema } from '../accounts/user-accounts';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { BadRequestException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';

import { isEmail } from 'class-validator';

import { randomBytes } from 'crypto';

import { addDays } from 'date-fns';

import { UserNotFoundException } from '../../../exceptions/user.notFound.exception';

import { SSOUsernameChangeForbiddenException } from '../errors/ssoUsernameChangeForbidden.exception';

import { UserAccounts } from '../accounts/user-accounts';
import { normalizeEmail } from '../accounts/normalize-email';

import { EmailService } from '../../../email/email.service';

import type { TransactionContext } from '../../../database/transaction-context';
import { isUniqueViolation } from '../../../database/persistence-errors';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../database/unit-of-work';
import { USER_STORE, type UserStore } from '../user-store.port';

/** Listing and searching users, and changes to an existing account's identity. */
@Injectable()
export class UserDirectory {
  private readonly logger = new Logger('UsersService');

  constructor(
    @Inject(USER_STORE) private readonly store: UserStore,
    private readonly accounts: UserAccounts,
    private readonly emailService: EmailService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  /** Resolve the identifier accepted by local login without ambiguous username/email queries. */
  async findByLoginIdentifier(identifier: string): Promise<UserAccount | null> {
    const value = identifier.trim();
    if (!value) return null;

    const options = value.includes('@') ? { email: value } : { username: value };
    const parsed = FindOneOptionsSchema.safeParse(options);
    if (!parsed.success) return null;

    return this.accounts.findOne(parsed.data);
  }

  async findMany(options: UserListOptions): Promise<PaginatedResponse<UserAccount>> {
    this.logger.debug(`Finding all users with options: ${JSON.stringify(options)}`);
    const { page, limit } = PaginationOptionsSchema.parse(options);

    if (Array.isArray(options.ids) && options.ids.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const { users, total } = await this.store.listUsers({ ...options, page, limit });
    this.logger.debug(`Found ${total} total users, returning page ${page} with ${users.length} results`);
    return { data: users, total, page, limit };
  }

  async updateOne(id: number, updateData: UpdateUserData, context?: TransactionContext): Promise<UserAccount> {
    // An explicit null clears the column; undefined leaves it unchanged.
    const trimOrNull = (value: string | null | undefined) => (value === null ? null : value?.trim());
    const updates: UpdateUserData = {
      externalIdentifier: trimOrNull(updateData.externalIdentifier),
      emailVerificationToken: trimOrNull(updateData.emailVerificationToken),
      emailVerificationTokenExpiresAt:
        'emailVerificationTokenExpiresAt' in updateData ? updateData.emailVerificationTokenExpiresAt : undefined,
      isEmailVerified: updateData.isEmailVerified ?? undefined,
      passwordResetToken: trimOrNull(updateData.passwordResetToken),
      passwordResetTokenExpiresAt:
        'passwordResetTokenExpiresAt' in updateData ? updateData.passwordResetTokenExpiresAt : undefined,
      lockedUntil: 'lockedUntil' in updateData ? updateData.lockedUntil : undefined,
      failedLoginAttempts: updateData.failedLoginAttempts ?? undefined,
      firstFailedLoginAt: 'firstFailedLoginAt' in updateData ? updateData.firstFailedLoginAt : undefined,
    };
    this.logger.debug(`Updating user with ID: ${id}`);

    await this.store.updateUser(id, updates, context);

    const updatedUser = await this.accounts.findOne({ id }, undefined, context);
    if (!updatedUser) {
      this.logger.error(`User not found after update, ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    this.logger.debug(`User updated successfully, ID: ${id}`);
    return updatedUser;
  }

  async changeUsername(targetUserId: number, newUsername: string, executingUser: { id: number }): Promise<UserAccount> {
    const isSSOUser = await this.accounts.isSSOUser(targetUserId);
    if (isSSOUser) {
      throw new SSOUsernameChangeForbiddenException();
    }

    newUsername = this.accounts.cleanupUsername(newUsername);
    if (newUsername.length === 0) {
      throw new BadRequestException('Username cannot be empty');
    }

    const targetUser = await this.accounts.findOne({ id: targetUserId });
    if (!targetUser) {
      throw new UserNotFoundException(targetUserId);
    }

    this.accounts.validateUsernameOrThrow(newUsername);

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

    await this.store.updateUser(targetUserId, { username: newUsername, lastUsernameChangeAt });

    const updated = await this.accounts.findOne({ id: targetUserId });
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

  async changeEmail(targetUserId: number, newEmail: string, executingUser: { id: number }): Promise<UserAccount> {
    const normalizedEmail = normalizeEmail(newEmail ?? '');
    if (!normalizedEmail) {
      throw new BadRequestException('Email cannot be empty');
    }
    if (!isEmail(normalizedEmail)) {
      throw new BadRequestException('Invalid email');
    }

    const targetUser = await this.accounts.findOne({ id: targetUserId });
    if (!targetUser) {
      throw new UserNotFoundException(targetUserId);
    }

    const isSelf = executingUser.id === targetUserId;
    const canUpdateUsers = !!(executingUser as AuthenticatedUser).effectivePermissions?.has('users.update');

    if (!isSelf && !canUpdateUsers) {
      throw new ForbiddenException("You do not have permission to change this user's email");
    }

    if (normalizeEmail(targetUser.email) === normalizedEmail) {
      return targetUser;
    }

    const existingEmail = await this.accounts.findOne({ email: normalizedEmail });
    if (existingEmail && existingEmail.id !== targetUserId) {
      throw new BadRequestException('Email already exists');
    }

    const token = randomBytes(16).toString('base64url').slice(0, 21);
    const expiresAt = addDays(new Date(), 3);

    // SMTP can take seconds, and while a transaction is open every other request waits for the connection: the mail
    // goes out after the commit. A failed send takes the change back (unless a newer change replaced it), as the
    // rollback did when sending ran inside the transaction.
    const send: { failure?: { error: unknown } } = {};
    let updated: UserAccount;
    try {
      updated = await this.uow.run(async (scope) => {
        await this.store.updateUser(
          targetUserId,
          {
            email: normalizedEmail,
            isEmailVerified: false,
            emailVerificationToken: token,
            emailVerificationTokenExpiresAt: expiresAt,
          },
          scope,
        );

        const changed = await this.accounts.findOne({ id: targetUserId }, undefined, scope);
        if (!changed) {
          throw new UserNotFoundException(targetUserId);
        }
        scope.afterCommit(async () => {
          try {
            await this.emailService.sendVerificationEmail(changed, token);
          } catch (error) {
            send.failure = { error };
            await this.takeBackEmailChange(targetUser, token);
          }
        });
        return changed;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestException('Email already exists');
      }
      throw error;
    }

    if (send.failure) throw send.failure.error;
    return updated;
  }

  private async takeBackEmailChange(previous: UserAccount, issuedToken: string): Promise<void> {
    try {
      await this.store.revertEmailChange(previous.id, issuedToken, {
        email: previous.email,
        isEmailVerified: previous.isEmailVerified,
        emailVerificationToken: previous.emailVerificationToken,
        emailVerificationTokenExpiresAt: previous.emailVerificationTokenExpiresAt,
      });
    } catch (revertError) {
      this.logger.error('Failed to take back an email change after an email failure', (revertError as Error).stack);
    }
  }

  async changeBillingFactor(targetUserId: number, newBillingFactor: number): Promise<UserAccount> {
    const targetUser = await this.accounts.findOne({ id: targetUserId });
    if (!targetUser) {
      throw new UserNotFoundException(targetUserId);
    }

    if (newBillingFactor < 0) {
      throw new BadRequestException('Billing factor must be at least 0');
    }

    await this.store.updateUser(targetUserId, { billingFactor: newBillingFactor });

    const updatedUser = await this.accounts.findOne({ id: targetUserId });
    if (!updatedUser) {
      throw new UserNotFoundException(targetUserId);
    }

    return updatedUser;
  }
}
