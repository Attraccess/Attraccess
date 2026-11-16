import { AUTH_RATE_LIMIT_METADATA, AUTH_RATE_LIMIT_OPTIONS_METADATA } from '../rate-limiting/rate-limit.decorator';
import { UsersRegistrationController } from './users-registration.controller';

describe('UsersRegistrationController rate-limit scopes', () => {
  const scopeOf = (method: keyof UsersRegistrationController) =>
    Reflect.getMetadata(AUTH_RATE_LIMIT_METADATA, UsersRegistrationController.prototype[method]);

  it('gives resend-verification-email its own scope, separate from password reset', () => {
    expect(scopeOf('resendVerificationEmail')).toBe('verification_email_resend');
    expect(scopeOf('requestPasswordReset')).toBe('password_reset_request');
  });

  it('keeps the default options for resend, so a successful resend clears its failures', () => {
    expect(
      Reflect.getMetadata(
        AUTH_RATE_LIMIT_OPTIONS_METADATA,
        UsersRegistrationController.prototype.resendVerificationEmail,
      ),
    ).toEqual({});
  });
});
