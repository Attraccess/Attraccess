export const VALKEY_UNAVAILABLE_MESSAGE = 'Session storage (Valkey) is unavailable; try again shortly';

// ioredis' own messages for a command that could not reach Valkey, and the ones this API raises itself when it gives
// up waiting (session-change-coordination.ts). Other ioredis errors (e.g. a Lua script failing) are real bugs.
const UNAVAILABLE_MESSAGES = new Set(['Connection is closed.', 'Valkey did not answer in time']);

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
