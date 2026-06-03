/**
 * Per-user messaging rate-limit policy.
 *
 * Each scope is throttled independently with a fixed window keyed by senderId.
 * Defaults are tuned to be invisible during normal interactive usage while
 * still blocking automated abuse. They can be overridden via environment
 * variables (documented in the repo `.env` example / README):
 *
 *   MESSAGING_SEND_RATE_LIMIT_MAX                (default 30)
 *   MESSAGING_SEND_RATE_LIMIT_WINDOW_SECONDS     (default 60)
 *   MESSAGING_CONTACT_RATE_LIMIT_MAX             (default 10)
 *   MESSAGING_CONTACT_RATE_LIMIT_WINDOW_SECONDS  (default 60)
 */

export type MessageRateLimitScope = 'send_message' | 'contact';

export interface MessageRateLimit {
  /** Maximum number of allowed actions within the window. */
  maxActions: number;
  /** Length of the rolling window in seconds. */
  windowSeconds: number;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function resolveMessageRateLimits(
  env: NodeJS.ProcessEnv = process.env,
): Record<MessageRateLimitScope, MessageRateLimit> {
  return {
    send_message: {
      maxActions: readPositiveInt(env.MESSAGING_SEND_RATE_LIMIT_MAX, 30),
      windowSeconds: readPositiveInt(env.MESSAGING_SEND_RATE_LIMIT_WINDOW_SECONDS, 60),
    },
    contact: {
      maxActions: readPositiveInt(env.MESSAGING_CONTACT_RATE_LIMIT_MAX, 10),
      windowSeconds: readPositiveInt(env.MESSAGING_CONTACT_RATE_LIMIT_WINDOW_SECONDS, 60),
    },
  };
}

/** Upper bound on tracked counters to keep memory bounded under abuse. */
export const MAX_MESSAGE_RATE_COUNTERS = 50_000;
