import { AuthenticationType } from '@attraccess/application-models';
import { ForbiddenException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { identityAuditEvent } from '../../audit/policies/identity';
import { AUDIT_RECORDER, AuditOrigin, AuditRecorder } from '../../audit/recorder/audit-event';
import { EmailService } from '../../email/email.service';
import { AuthService } from '../auth/auth.service';
import { BruteForceProtectionService } from '../rate-limiting/brute-force.service';
import { ChangeUnverifiedEmailDto } from './dtos/changeUnverifiedEmail.dto';
import { mapEmailSendError } from './email-send-error.util';
import { SignupDomainService } from './signup-domain.service';
import { UsersService } from './users.service';

/**
 * Lets someone who just registered with a wrong address redirect the activation link before they can sign in. The
 * account is proven by its local password, so this is a second credential check and is throttled like sign-in.
 */
@Injectable()
export class UnverifiedEmailChangeService {
  private readonly logger = new Logger(UnverifiedEmailChangeService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly signupDomainService: SignupDomainService,
    private readonly bruteForce: BruteForceProtectionService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  public async changeUnverifiedEmail(body: ChangeUnverifiedEmailDto, request?: AuditOrigin['request']): Promise<void> {
    const user = await this.usersService.findByLoginIdentifier(body.identifier);
    if (!user) {
      throw new UnauthorizedException('UnkownUserOrPasswordException');
    }

    await this.bruteForce.runAccountAttempt(user.id, async () => {
      await this.bruteForce.assertAccountAllowed(user);

      const isValid = await this.authService.validateAuthenticationDetails(user.id, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: { password: body.password },
      });
      if (!isValid) {
        await this.bruteForce.recordAccountFailure(user.id);
        throw new UnauthorizedException('UnkownUserOrPasswordException');
      }

      if (user.isEmailVerified) {
        throw new ForbiddenException('EmailAlreadyVerified');
      }

      await this.signupDomainService.assertEmailDomainAllowed(body.newEmail);

      try {
        if (user.email.trim().toLowerCase() === body.newEmail.trim().toLowerCase()) {
          // Nothing to change: the user wants the link again, so send a fresh one.
          const token = await this.authService.generateEmailVerificationToken(user);
          await this.emailService.sendVerificationEmail(user, token);
          return;
        }
        await this.usersService.changeEmail(user.id, body.newEmail, { id: user.id });
      } catch (error) {
        this.logger.error(
          `Could not change the unverified email of user ID: ${user.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw mapEmailSendError(error);
      }

      await this.audit.record(
        identityAuditEvent(
          'unverified_email_changed',
          { actor: { id: user.id, authenticationMethod: null }, request },
          { id: user.id },
        ),
      );
    });
  }
}
