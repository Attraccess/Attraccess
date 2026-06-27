import { ForbiddenException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { User } from '@attraccess/database-entities';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { PasswordPolicyViolationException } from '../password-policy/password-policy.errors';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { ChangePasswordDto } from './dtos/changePassword.dto';
import { SetUserPasswordDto } from './dtos/setUserPassword.dto';

/**
 * Password reset request, reset-token redemption and admin/self password set.
 */
@Injectable()
export class UserPasswordService {
  private readonly logger = new Logger(UserPasswordService.name);

  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly tokenHashService: TokenHashService,
    private readonly passwordPolicyService: PasswordPolicyService,
  ) {}

  public async requestPasswordReset(email: string): Promise<void> {
    this.logger.debug(`Resetting password for: ${email}`);

    const token = await this.authService.generatePasswordResetToken(email);
    if (!token) {
      this.logger.debug(`No user found with email: ${email}`);
      return;
    }

    const user = await this.usersService.findOne({ email });
    if (!user) {
      this.logger.debug(`No user found with email: ${email}`);
      return;
    }

    const isSSOUser = await this.usersService.isSSOUser(user.id);
    if (isSSOUser) {
      throw new ForbiddenException('You cannot reset the password of an SSO user');
    }

    await this.emailService.sendPasswordResetEmail(user, token);
    this.logger.debug(`Password reset e-mail sent to: ${email}`);
  }

  public async changePasswordViaResetToken(userId: number, body: ChangePasswordDto): Promise<void> {
    this.logger.debug(`Changing password for user ID: ${userId}`);

    const user = await this.usersService.findOne({ id: userId });
    if (!user) {
      this.logger.debug(`User not found with ID: ${userId}`);
      throw new UserNotFoundException(userId);
    }

    const isSSOUser = await this.usersService.isSSOUser(userId);
    if (isSSOUser) {
      throw new ForbiddenException('You cannot reset the password of an SSO user');
    }

    const expected = this.tokenHashService.hashToken(body.token);
    if (user.passwordResetToken !== expected && user.passwordResetToken !== body.token) {
      this.logger.debug(`Invalid token for user ID: ${userId}`);
      throw new ForbiddenException('Invalid token');
    }

    const policyResult = await this.passwordPolicyService.validate(
      body.password,
      { username: user.username, email: user.email },
      { userIdForHistory: user.id, role: this.passwordPolicyService.resolveRole(user) },
    );
    if (!policyResult.ok) {
      throw new PasswordPolicyViolationException(policyResult.errors);
    }

    await this.passwordPolicyService.archiveCurrentPasswordToHistory(user.id);
    await this.authService.changePassword(user, body.password);

    await this.usersService.updateOne(userId, {
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
    });
  }

  public async setUserPassword(id: number, body: SetUserPasswordDto, requestUser: User): Promise<void> {
    this.logger.debug(`Setting password for user ID: ${id}, by user ID: ${requestUser.id}`);

    // Prevent users from updating their own password through this endpoint
    if (requestUser.id !== id && !requestUser.effectivePermissions?.has('users.update')) {
      this.logger.warn(`User ${id} attempted to change password of another user without permission`);
      throw new ForbiddenException('You cannot change password of another user without permission');
    }

    const user = await this.usersService.findOne({ id });
    if (!user) {
      this.logger.debug(`User not found with ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    const policyResult = await this.passwordPolicyService.validate(
      body.password,
      { username: user.username, email: user.email },
      { userIdForHistory: user.id, role: this.passwordPolicyService.resolveRole(user) },
    );
    if (!policyResult.ok) {
      throw new PasswordPolicyViolationException(policyResult.errors);
    }

    await this.passwordPolicyService.archiveCurrentPasswordToHistory(user.id);
    await this.authService.changePassword(user, body.password);

    this.logger.debug(`Password successfully updated for user ID: ${id}`);
  }
}
