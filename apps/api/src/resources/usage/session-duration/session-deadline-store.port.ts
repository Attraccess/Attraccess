import type { UsageSession } from '@attraccess/application-models';
import type { TransactionScope } from '../../../database/unit-of-work';

export const SESSION_DEADLINE_STORE = Symbol.for('attraccess.usage.session-deadline-store');

/** A running session that has reached its automatic end. */
export interface OverdueSession {
  id: number;
  resourceId: number;
}

/**
 * Persistence of the automatic end of sessions. Every change is conditional on the state the caller read, so
 * several API instances (and a manual stop) can race on one session without double effects.
 */
export interface SessionDeadlineStore {
  /**
   * Moves the deadline of a running session, only while it still ends at `expected`. Re-arms the warnings by
   * storing `warnedOffsetMinutes`. Reports `false` when the session ended or its deadline changed meanwhile.
   */
  extend(
    usageId: number,
    expected: Date,
    next: { autoEndAt: Date; warnedOffsetMinutes: number | null },
    context?: TransactionScope,
  ): Promise<boolean>;

  /** Published running sessions whose deadline is at or before `now`, earliest first. */
  findOverdue(now: Date, limit: number): Promise<OverdueSession[]>;

  /** Published running sessions that end within the next `withinMinutes`, with their resource and user. */
  findEndingWithin(now: Date, withinMinutes: number): Promise<UsageSession[]>;

  /**
   * Marks the warning of this offset as sent for this deadline. Reports `true` for exactly one caller; `false`
   * when it was sent already (a smaller offset counts as sent too), or the session or its deadline changed.
   */
  claimWarning(usageId: number, autoEndAt: Date, offsetMinutes: number): Promise<boolean>;
}
