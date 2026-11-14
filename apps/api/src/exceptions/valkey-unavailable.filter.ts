import { ArgumentsHost, Catch, ExceptionFilter, Logger, ServiceUnavailableException } from '@nestjs/common';
import { isValkeyUnavailableError, VALKEY_UNAVAILABLE_MESSAGE } from '../valkey/valkey-unavailable';

/**
 * Answers 503 instead of 500 when a request needed Valkey (sessions, SSO state, API token rate limits) while it is
 * unreachable. Every other exception goes to `next` unchanged.
 */
@Catch()
export class ValkeyUnavailableFilter implements ExceptionFilter {
  private readonly logger = new Logger(ValkeyUnavailableFilter.name);

  constructor(private readonly next: ExceptionFilter) {}

  catch(exception: unknown, host: ArgumentsHost) {
    if (!isValkeyUnavailableError(exception)) {
      return this.next.catch(exception, host);
    }
    // Log only the message: Valkey AUTH errors carry the password in `error.command.args`.
    this.logger.warn(`Answering 503, Valkey is unavailable (${(exception as Error).message})`);
    return this.next.catch(new ServiceUnavailableException(VALKEY_UNAVAILABLE_MESSAGE), host);
  }
}
