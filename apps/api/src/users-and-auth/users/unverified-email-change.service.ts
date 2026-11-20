import { AuthenticationType } from '@attraccess/application-models';
import { ForbiddenException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { identityAuditEvent } from '../../audit/policies/identity';
import { AUDIT_RECORDER, AuditOrigin, AuditRecorder } from '../../audit/recorder/audit-event';
import { EmailService } from '../../email/email.service';
import { AuthService } from '../auth/auth.service';
import { UnknownUserOrPasswordException } from '../auth/errors/unknownUserOrPassword.exception';
import { TwoFactorService } from '../auth/two-factor.service';
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
    private readonly twoFactorService: TwoFactorService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  public async changeUnverifiedEmail(body: ChangeUnverifiedEmailDto, request?: AuditOrigin['request']): Promise<void> {
    const found = await this.usersService.findByLoginIdentifier(body.identifier);
    if (!found) {
      throw new UnknownUserOrPasswordException();
    }

    await this.bruteForce.runAccountAttempt(found.id, async () => {
      // Re-read inside the per-account lock: an earlier attempt or a verification may have changed the account.
      const user = await this.usersService.findOne({ id: found.id });
      if (!user) {
        throw new UnknownUserOrPasswordException();
      }
      await this.bruteForce.assertAccountAllowed(user);

      const isValid = await this.authService.validateAuthenticationDetails(user.id, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: { password: body.password },
      });
      if (!isValid) {
        await this.bruteForce.recordAccountFailure(user.id);
        await this.audit.record(
          identityAuditEvent(
            'unverified_email_changed',
            { actor: { id: null, authenticationMethod: null }, request },
            { id: user.id },
            { reason: 'invalid_credentials' },
            'failed',
          ),
        );
        throw new UnknownUserOrPasswordException();
      }

      if (user.isEmailVerified) {
        throw new ForbiddenException('EmailAlreadyVerified');
      }
      // The password alone must not move the recovery address of an account a second factor protects (e.g. one
      // whose owner changed a verified address and has not opened the new link yet).
      if ((await this.twoFactorService.getStatus(user)).enabled) {
        throw new ForbiddenException('UnverifiedEmailChangeNotAllowed');
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
        throw this.toClientError(user.id, error);
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

  /** Maps mail failures to the 503 registration answers with; user errors such as a taken address pass unchanged. */
  private toClientError(userId: number, error: unknown): unknown {
    try {
      mapEmailSendError(error);
    } catch (mapped) {
      if (mapped instanceof ServiceUnavailableException) {
        this.logger.error(
          `Could not send the verification email for user ID: ${userId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      return mapped;
    }
  }
}
