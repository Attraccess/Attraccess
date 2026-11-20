import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

const TRANSIENT_TRANSPORT_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ESOCKET',
  'ECONNECTION',
  'EDNS',
]);

/**
 * Maps SMTP configuration and transient transport failures to client-safe errors,
 * while re-throwing every other error unchanged. Extracted from UsersController so
 * the focused user controllers/services can share identical behavior.
 */
export function mapEmailSendError(error: unknown): never {
  if (error instanceof Error && error.message === 'SMTP configuration not set') {
    throw new BadRequestException('SMTP is not configured. Configure email before sending email.');
  }

  // nodemailer reports a refused connection as code ESOCKET and keeps the system code in originalCode.
  const { code, originalCode } = (error ?? {}) as { code?: string; originalCode?: string };
  if (
    (code !== undefined && TRANSIENT_TRANSPORT_CODES.has(code)) ||
    (originalCode !== undefined && TRANSIENT_TRANSPORT_CODES.has(originalCode))
  ) {
    throw new ServiceUnavailableException('EmailSendFailed');
  }
  throw error;
}
