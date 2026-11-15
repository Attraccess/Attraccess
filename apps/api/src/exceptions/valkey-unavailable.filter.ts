import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { isValkeyUnavailableError, valkeyUnavailableException } from '../valkey/valkey-unavailable';

/**
 * Answers 503 instead of 500 when a request needed Valkey (sessions, SSO state, API token rate limits) while it is
 * unreachable. Every other exception goes to `next` unchanged.
 */
@Catch()
export class ValkeyUnavailableFilter implements ExceptionFilter {
  constructor(private readonly next: ExceptionFilter) {}

  catch(exception: unknown, host: ArgumentsHost) {
    if (!isValkeyUnavailableError(exception)) {
      return this.next.catch(exception, host);
    }
    return this.next.catch(valkeyUnavailableException(exception as Error), host);
  }
}
