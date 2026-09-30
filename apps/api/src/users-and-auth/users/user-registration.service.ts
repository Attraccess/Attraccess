import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { AuthenticationType, User } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
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
  private firstTimeSetupOverwriteLock = Promise.resolve();

  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly signupDomainService: SignupDomainService,
  ) {}

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

  private async registerUser(
    body: CreateUserDto,
    locale: string | undefined,
    hashedPassword: string | undefined,
    overwriteFirstTimeAdmin: boolean | undefined,
  ): Promise<User> {
    let existingAdmin: User | undefined;

    const { user, verificationToken } = await this.usersService.withTransaction(async (manager: EntityManager) => {
      existingAdmin = overwriteFirstTimeAdmin
        ? await this.usersService.releaseFirstTimeSetupAdminIdentifiers(manager)
        : undefined;
      const user = await this.usersService.createOne(
        {
          username: body.username,
          email: body.email,
          externalIdentifier: null,
          locale,
          isFirstTimeSetupAdmin: !!existingAdmin,
        },
        manager,
        { excludedUserIdFromLicenseUsage: existingAdmin?.id },
      );
      this.logger.debug(`User created with ID: ${user.id}`);

      this.logger.debug(`Adding authentication details for user ID: ${user.id}, strategy: ${body.strategy}`);
      const authenticationDetails = await this.authService.addAuthenticationDetails(
        user.id,
        {
          type: body.strategy,
          details: {
            password: body.password,
          },
        },
        manager,
        hashedPassword,
      );
      this.logger.debug(`Authentication details added with ID: ${authenticationDetails.id}`);

      this.logger.debug(`Generating email verification token for user ID: ${user.id}`);
      const verificationToken = await this.authService.generateEmailVerificationToken(user, manager);
      return { user, verificationToken };
    });

    try {
      this.logger.debug(`Sending verification email to user ID: ${user.id}`);
      await this.emailService.sendVerificationEmail(user, verificationToken);
      this.logger.debug(`Verification email sent to user ID: ${user.id}`);
    } catch (error) {
      this.logger.error(
        `Error sending verification email for ${body.email}`,
        error instanceof Error ? error.stack : String(error),
      );
      try {
        if (existingAdmin) {
          await this.usersService.rollbackFirstTimeSetupAdminReplacement(user.id, existingAdmin);
        } else {
          await this.usersService.rollbackFailedRegistration(user.id);
        }
      } catch (rollbackError) {
        this.logger.error(
          `Error rolling back failed registration for user ID: ${user.id}`,
          rollbackError instanceof Error ? rollbackError.stack : String(rollbackError),
        );
        throw rollbackError;
      }
      throw mapEmailSendError(error);
    }

    if (existingAdmin) {
      this.logger.debug(`Overwriting first-time-setup admin with ID: ${existingAdmin.id}`);
      try {
        await this.usersService.deleteOne(existingAdmin.id);
      } catch (error) {
        try {
          await this.usersService.rollbackFirstTimeSetupAdminReplacement(user.id, existingAdmin);
        } catch (rollbackError) {
          this.logger.error(
            `Error rolling back failed first-time-setup replacement for user ID: ${user.id}`,
            rollbackError instanceof Error ? rollbackError.stack : String(rollbackError),
          );
          throw rollbackError;
        }
        throw error;
      }
    }

    this.usersService.recordCreatedUser(user);
    this.logger.debug(`User creation completed successfully for ID: ${user.id}`);
    return user;
  }

  private async withFirstTimeSetupOverwriteLock<T>(handler: () => Promise<T>): Promise<T> {
    const previous = this.firstTimeSetupOverwriteLock;
    let release!: () => void;
    this.firstTimeSetupOverwriteLock = new Promise((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await handler();
    } finally {
      release();
    }
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
