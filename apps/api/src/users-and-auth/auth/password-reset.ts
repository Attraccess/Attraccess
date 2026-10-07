import { AuthenticationType, User } from '@attraccess/database-entities';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { addDays } from 'date-fns';
import { EmailVerificationImplementation } from './email-verification';
export abstract class PasswordResetImplementation extends EmailVerificationImplementation {
  async generatePasswordResetToken(email: string): Promise<string> {
    const user = await this.usersService.findOne({ email });
    if (!user) {
      this.logger.debug(`No user found with email: ${email}`);
      return null;
    }

    const token = randomBytes(16).toString('base64url').slice(0, 21);
    const storedToken = this.tokenHashService.hashToken(token);
    await this.usersService.updateOne(user.id, {
      passwordResetToken: storedToken,
      passwordResetTokenExpiresAt: addDays(new Date(), 1),
    });

    return token;
  }

  async changePassword(user: User, password: string): Promise<void> {
    const isSSOUser = await this.usersService.isSSOUser(user.id);
    if (isSSOUser) {
      throw new ForbiddenException('You cannot change the password of an SSO user');
    }

    const authenticationDetail = await this.getAuthenticationDetail(AuthenticationType.LOCAL_PASSWORD, user.id).catch(
      (error) => {
        if (error instanceof NotFoundException) {
          return null;
        }
        throw error;
      },
    );

    if (authenticationDetail) {
      authenticationDetail.password = await this.hashPassword(password);
      await this.authenticationDetailRepository.save(authenticationDetail);
    } else {
      await this.addAuthenticationDetails(user.id, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: {
          password,
        },
      });
    }

    // Notify user about password change
    await this.emailService.sendPasswordChangedEmail(user);
  }
}
