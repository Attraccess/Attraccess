import { AuthenticationDetail, ResourceUsage, Session, User } from '@attraccess/database-entities';
import { ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { addDays } from 'date-fns';
import { EntityManager, In, IsNull, Not } from 'typeorm';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { UserDirectoryQueryImplementation } from './user-directory-query';
import {
  DeleteAccountTokenExpiredException,
  DeleteAccountTokenInvalidException,
  UserHasActiveUsageSessionsException,
} from './users.service.feature-definitions';
export abstract class UserAccountDeletionImplementation extends UserDirectoryQueryImplementation {
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
