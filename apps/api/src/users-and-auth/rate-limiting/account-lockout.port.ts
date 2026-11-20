/** DI token for the {@link AccountLockoutStore}. */
export const ACCOUNT_LOCKOUT_STORE = Symbol.for('attraccess.auth.account-lockout-store');

/**
 * The persisted part of brute-force protection: an account's lock and failure streak survive restarts and other
 * API instances. The in-memory counters decide; this store only records the outcome. Each operation is one
 * atomic write of the account's lockout state.
 */
export interface AccountLockoutStore {
  /** A failed attempt that did not lock the account: records the streak and when it started. */
  recordFailureStreak(userId: number, streak: { failedAttempts: number; firstFailedAt: Date }): Promise<void>;
  /** The streak reached the limit: locks the account until `lockedUntil` and resets the streak. */
  lockAccount(userId: number, lockedUntil: Date): Promise<void>;
  /** A successful sign-in or an administrator unlock: clears the lock and the streak. */
  clearLockout(userId: number): Promise<void>;
}
