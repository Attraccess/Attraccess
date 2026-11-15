import { Logger, ServiceUnavailableException } from '@nestjs/common';

export const VALKEY_UNAVAILABLE_MESSAGE = 'Session storage (Valkey) is unavailable; try again shortly';

// ioredis' own messages for a command that could not reach Valkey, and the ones this API raises itself when it gives
// up waiting (session-change-coordination.ts). Other ioredis errors (e.g. a Lua script failing) are real bugs.
const UNAVAILABLE_MESSAGES = new Set(['Connection is closed.', 'Valkey did not answer in time']);
const WARNING_INTERVAL_MS = 60_000;

const logger = new Logger('ValkeyUnavailable');
let lastWarningAt = Number.NEGATIVE_INFINITY;

/** Whether a Valkey command failed because Valkey was unreachable, not because the command itself was wrong. */
export function isValkeyUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === 'MaxRetriesPerRequestError' ||
    UNAVAILABLE_MESSAGES.has(error.message) ||
    /^Valkey is (reconnecting|close|end)$/.test(error.message)
  );
}

/**
 * The 503 for a request that needed Valkey while it was unreachable. Warns at most once a minute, so an outage does
 * not log every request. Logs only the message: Valkey AUTH errors carry the password in `error.command.args`.
 */
export function valkeyUnavailableException(error: Error): ServiceUnavailableException {
  const now = Date.now();
  if (now - lastWarningAt >= WARNING_INTERVAL_MS) {
    lastWarningAt = now;
    logger.warn(`Answering 503, Valkey is unavailable (${error.message}); repeats within a minute are not logged`);
  }
  return new ServiceUnavailableException(VALKEY_UNAVAILABLE_MESSAGE);
}
