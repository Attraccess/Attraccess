/**
 * Per-user messaging rate-limit policy.
 *
 * Each scope is throttled independently with a fixed window keyed by senderId.
 * The actual limits are stored in the database and managed through the system
 * settings UI (Settings → Messaging rate limiting); see `SettingsService`
 * (MESSAGING_* keys) for the persisted values and defaults.
 */

export type MessageRateLimitScope = 'send_message' | 'contact';

export interface MessageRateLimit {
  /** Maximum number of allowed actions within the window. */
  maxActions: number;
  /** Length of the rolling window in seconds. */
  windowSeconds: number;
}

/** Upper bound on tracked counters to keep memory bounded under abuse. */
export const MAX_MESSAGE_RATE_COUNTERS = 50_000;
