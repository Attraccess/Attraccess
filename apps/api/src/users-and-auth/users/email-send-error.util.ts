import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Maps transient SMTP transport failures to a 503 so callers can retry, while
 * re-throwing every other error unchanged. Extracted from UsersController so the
 * focused user controllers/services can share identical behavior.
 */
export function mapEmailSendError(error: unknown): never {
  const code = (error as { code?: string })?.code;
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    throw new ServiceUnavailableException('EmailSendFailed');
  }
  throw error;
}
