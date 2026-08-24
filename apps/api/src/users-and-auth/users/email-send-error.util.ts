import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

/**
 * Maps SMTP configuration and transient transport failures to client-safe errors,
 * while re-throwing every other error unchanged. Extracted from UsersController so
 * the focused user controllers/services can share identical behavior.
 */
export function mapEmailSendError(error: unknown, context?: 'registration'): never {
  if (error instanceof Error && error.message === 'SMTP configuration not set') {
    const message =
      context === 'registration'
        ? 'SMTP is not configured. Configure email before creating a user.'
        : 'SMTP is not configured. Configure email before sending email.';
    throw new BadRequestException(message);
  }

  const code = (error as { code?: string })?.code;
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    throw new ServiceUnavailableException('EmailSendFailed');
  }
  throw error;
}
