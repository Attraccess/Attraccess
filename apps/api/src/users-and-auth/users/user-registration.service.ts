import { ForbiddenException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { AuthenticationDetail, AuthenticationType, User } from '@attraccess/database-entities';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { PasswordPolicyViolationException } from '../password-policy/password-policy.errors';
import { SignupDomainService } from './signup-domain.service';
import { CreateUserDto } from './dtos/createUser.dto';
import { AcceptInvitationDto } from './dtos/acceptInvitation.dto';
import { mapEmailSendError } from './email-send-error.util';

/**
 * Self-service registration, email verification and invitation acceptance flows.
 */
@Injectable()
export class UserRegistrationService {
  private readonly logger = new Logger(UserRegistrationService.name);

  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly signupDomainService: SignupDomainService,
  ) {}

  public async createOne(body: CreateUserDto): Promise<User> {
    this.logger.debug(`Creating new user with username: ${body.username} and email: ${body.email}`);

    if (body.overwriteFirstTimeAdmin) {
      await this.ensureFirstTimeSetupIncompleteAndDeleteAdmin();
    }

    await this.signupDomainService.assertEmailDomainAllowed(body.email);

    const policyResult = await this.passwordPolicyService.validate(body.password, {
      username: body.username,
      email: body.email,
    });
    if (!policyResult.ok) {
      throw new PasswordPolicyViolationException(policyResult.errors);
    }

    const user = await this.usersService.createOne({
      username: body.username,
      email: body.email,
      externalIdentifier: null,
    });
    this.logger.debug(`User created with ID: ${user.id}`);

    let authenticationDetails: AuthenticationDetail | null = null;
    try {
      this.logger.debug(`Adding authentication details for user ID: ${user.id}, strategy: ${body.strategy}`);
      authenticationDetails = await this.authService.addAuthenticationDetails(user.id, {
        type: body.strategy,
        details: {
          password: body.password,
        },
      });
      this.logger.debug(`Authentication details added with ID: ${authenticationDetails.id}`);
    } catch (e) {
      this.logger.error(`Error adding authentication details for user ID: ${user.id}`, e.stack);
      await this.usersService.deleteOne(user.id);
      throw e;
    }

    try {
      this.logger.debug(`Generating email verification token for user ID: ${user.id}`);
      const verificationToken = await this.authService.generateEmailVerificationToken(user);
      this.logger.debug(`Sending verification email to user ID: ${user.id}`);
      await this.emailService.sendVerificationEmail(user, verificationToken);
      this.logger.debug(`Verification email sent to user ID: ${user.id}`);
    } catch (e) {
      this.logger.error(`Error sending verification email for user ID: ${user.id}`, e.stack);
      if (authenticationDetails) {
        await this.authService.removeAuthenticationDetails(authenticationDetails.id);
      }
      await this.usersService.deleteOne(user.id);
      throw e;
    }

    this.logger.debug(`User creation completed successfully for ID: ${user.id}`);
    return user;
  }

  private async ensureFirstTimeSetupIncompleteAndDeleteAdmin(): Promise<void> {
    const totalUsers = await this.usersService.countUsers();
    if (totalUsers !== 1) {
      throw new ForbiddenException('First-time setup is already complete');
    }

    const { data: firstPage } = await this.usersService.findMany({ page: 1, limit: 1 });
    const existingAdmin = firstPage[0];
    if (!existingAdmin || existingAdmin.isEmailVerified) {
      throw new ForbiddenException('First-time setup is already complete');
    }

    this.logger.debug(`Overwriting first-time-setup admin with ID: ${existingAdmin.id}`);
    await this.usersService.deleteOne(existingAdmin.id);
  }

  public async verifyEmail(email: string, token: string): Promise<void> {
    this.logger.debug(`Verifying email for: ${email} with token: ${token.substring(0, 5)}...`);
    await this.authService.verifyEmail(email, token);
    this.logger.debug(`Email verified successfully for: ${email}`);
  }

  public async resendVerificationEmail(email: string): Promise<void> {
    this.logger.debug(`Resend verification email requested for: ${email}`);

    const user = await this.usersService.findOne({ email });
    if (!user || user.isEmailVerified) {
      this.logger.debug(`No unverified user found for: ${email}`);
      return;
    }

    try {
      const verificationToken = await this.authService.generateEmailVerificationToken(user);
      await this.emailService.sendVerificationEmail(user, verificationToken);
      this.logger.debug(`Verification email resent to: ${email}`);
    } catch (e) {
      this.logger.error(`Error resending verification email for: ${email}`, e.stack);
      throw mapEmailSendError(e);
    }
  }

  public async acceptInvitation(body: AcceptInvitationDto): Promise<User> {
    this.logger.debug(`Accepting invitation for: ${body.email} with token: ${body.token.substring(0, 5)}...`);

    await this.authService.verifyEmail(body.email, body.token);

    const user = await this.usersService.findOne({ email: body.email });

    const policyResult = await this.passwordPolicyService.validate(
      body.password,
      { username: user.username, email: user.email },
      { role: this.passwordPolicyService.resolveRole(user) },
    );
    if (!policyResult.ok) {
      throw new PasswordPolicyViolationException(policyResult.errors);
    }

    await this.authService.addAuthenticationDetails(user.id, {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: {
        password: body.password,
      },
    });
    this.logger.debug(`Invitation accepted successfully for: ${body.email}`);
    return user;
  }
}
