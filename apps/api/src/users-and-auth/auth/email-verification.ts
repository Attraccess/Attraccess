import { User } from '@attraccess/database-entities';
import { randomBytes } from 'crypto';
import { addDays } from 'date-fns';
import { EntityManager } from 'typeorm';
import {
  UserEmailInvalidVerificationTokenException,
  UserEmailVerificationTokenExpiredException,
} from './auth.service.feature-definitions';
import { LocalAuthenticationImplementation } from './local-authentication';
export abstract class EmailVerificationImplementation extends LocalAuthenticationImplementation {
  async generateEmailVerificationToken(user: User, manager?: EntityManager): Promise<string> {
    const token = randomBytes(16).toString('base64url').slice(0, 21);
    const storedToken = this.tokenHashService.hashToken(token);

    this.logger.debug(`Setting email verification token for user ID: ${user.id}`);
    await this.usersService.updateOne(
      user.id,
      {
        emailVerificationToken: storedToken,
        emailVerificationTokenExpiresAt: addDays(new Date(), 3),
      },
      manager,
    );

    this.logger.debug(`Email verification token set for user ID: ${user.id}`);
    return token;
  }

  async verifyEmail(email: string, token: string): Promise<void> {
    this.logger.debug(`Verifying email: ${email} with token: ${token.substring(0, 5)}...`);
    const user = await this.usersService.findOne({ email });

    if (!user) {
      this.logger.debug(`No user found with email: ${email}`);
      throw new UserEmailInvalidVerificationTokenException();
    }

    const expected = this.tokenHashService.hashToken(token);
    if (user.emailVerificationToken !== expected && user.emailVerificationToken !== token) {
      this.logger.debug(`Invalid verification token for user ID: ${user.id}`);
      throw new UserEmailInvalidVerificationTokenException();
    }

    if (user.emailVerificationTokenExpiresAt < new Date()) {
      this.logger.debug(`Expired verification token for user ID: ${user.id}`);
      throw new UserEmailVerificationTokenExpiredException();
    }

    this.logger.debug(`Marking email as verified for user ID: ${user.id}`);
    await this.usersService.updateOne(user.id, {
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null,
    });
    this.logger.debug(`Email successfully verified for user ID: ${user.id}`);
  }
}
