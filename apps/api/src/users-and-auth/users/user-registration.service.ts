import { AuthenticationType, User } from '@attraccess/database-entities';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { EmailService } from '../../email/email.service';
import { AuthService } from '../auth/auth.service';
import { PasswordPolicyViolationException } from '../password-policy/password-policy.errors';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { AcceptInvitationDto } from './dtos/acceptInvitation.dto';
import { CreateUserDto } from './dtos/createUser.dto';
import { mapEmailSendError } from './email-send-error.util';
import { SignupDomainService } from './signup-domain.service';
import { UserAccountRegistrationImplementation } from './user-account-registration';
import { UsersService } from './users.service';

/**
 * Self-service registration, email verification and invitation acceptance flows.
 */
@Injectable()
export class UserRegistrationService extends UserAccountRegistrationImplementation {
  protected readonly logger = new Logger(UserRegistrationService.name);
  protected firstTimeSetupOverwriteLock = Promise.resolve();

  constructor(
    protected readonly usersService: UsersService,
    @Inject(forwardRef(() => AuthService))
    protected readonly authService: AuthService,
    protected readonly emailService: EmailService,
    protected readonly passwordPolicyService: PasswordPolicyService,
    protected readonly signupDomainService: SignupDomainService,
  ) {
    super();
  }

  public async createOne(body: CreateUserDto, locale?: string): Promise<User> {
    this.logger.debug(`Creating new user with username: ${body.username} and email: ${body.email}`);

    await this.signupDomainService.assertEmailDomainAllowed(body.email);

    const policyResult = await this.passwordPolicyService.validate(body.password, {
      username: body.username,
      email: body.email,
    });
    if (!policyResult.ok) {
      throw new PasswordPolicyViolationException(policyResult.errors);
    }

    try {
      await this.emailService.assertSmtpConfigured();
    } catch (error) {
      throw mapEmailSendError(error);
    }

    const hashedPassword =
      body.strategy === AuthenticationType.LOCAL_PASSWORD
        ? await this.authService.hashPassword(body.password)
        : undefined;

    const register = () => this.registerUser(body, locale, hashedPassword, body.overwriteFirstTimeAdmin);
    return body.overwriteFirstTimeAdmin ? await this.withFirstTimeSetupOverwriteLock(register) : await register();
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
      { role: await this.passwordPolicyService.resolveRole(user) },
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
