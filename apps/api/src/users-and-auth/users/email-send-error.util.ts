import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

/**
 * Maps SMTP configuration and transient transport failures to client-safe errors,
 * while re-throwing every other error unchanged. Extracted from UsersController so
 * the focused user controllers/services can share identical behavior.
 */
export function mapEmailSendError(error: unknown): never {
  if (error instanceof Error && error.message === 'SMTP configuration not set') {
    throw new BadRequestException('SMTP is not configured. Configure email before sending email.');
  }

  const code = (error as { code?: string })?.code;
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    throw new ServiceUnavailableException('EmailSendFailed');
  }
  throw error;
}
