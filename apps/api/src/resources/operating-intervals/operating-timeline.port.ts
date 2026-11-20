import type { OperatingIntervalRecord, OperatingTimelineSession } from '@attraccess/application-models';
import type { TransactionContext } from '../../database/transaction-context';

export const OPERATING_TIMELINE_STORE = Symbol.for('attraccess.operating-intervals.timeline-store');

export type OperatingState = 'operating' | 'idle';

export interface OperatingTransitionProvenance {
  flowNodeId: string;
  flowRunId?: string;
}

/** One resource and the earliest moment of the window a read covers for it. */
export interface TimelineWindow {
  resourceId: number;
  from: Date;
}

/** A transition was refused because the server clock is earlier than the last recorded transition. */
export class OperatingClockRegressionError extends Error {
  constructor() {
    super('Server clock precedes the last operating transition');
    this.name = 'OperatingClockRegressionError';
  }
}

export interface OperatingTimelinePage {
  intervals: OperatingIntervalRecord[];
  total: number;
}

/**
 * The authoritative machine operating timeline. Interval rows are retained indefinitely (ATT-1024): no operation here
 * deletes one. Reads that take a `context` run inside the transaction the caller holds.
 */
export interface OperatingTimelineStore {
  /**
   * Records one transition under the resource's own write lock and in its own short transaction, so an accepted
   * observation never rolls back with an unrelated transaction. The clock is read after the lock is held. Returns
   * `null` when the resource already was in the target state, or when a concurrent duplicate `operating` transition
   * lost the race on the one-open-interval rule.
   */
  recordTransition(
    resourceId: number,
    state: OperatingState,
    provenance?: OperatingTransitionProvenance,
  ): Promise<OperatingIntervalRecord | null>;

  /** Intervals that overlap `[window.from, to)` per window, earliest first. `to` is exclusive. */
  findIntervals(windows: TimelineWindow[], to: Date, context?: TransactionContext): Promise<OperatingIntervalRecord[]>;

  /**
   * Started usage sessions (not door actions, not pending reservations) that overlap `[window.from, to)` per window,
   * earliest first. `excludeUsageId` leaves one session out (the one a share is computed for).
   */
  findSessions(
    windows: TimelineWindow[],
    to: Date,
    options?: { excludeUsageId?: number },
    context?: TransactionContext,
  ): Promise<OperatingTimelineSession[]>;

  /** The resources among `resourceIds` that ever produced an interval. */
  findResourcesWithIntervals(resourceIds: number[]): Promise<Set<number>>;

  /** Ends already requested but not yet stored: usage id to the time its stop or takeover takes effect. */
  findPendingSessionEnds(resourceIds: number[], context?: TransactionContext): Promise<Map<number, Date>>;

  /** The open interval, if any, and the newest interval of a resource. */
  findCurrentState(
    resourceId: number,
  ): Promise<{ open: OperatingIntervalRecord | null; latest: OperatingIntervalRecord | null }>;

  /** Intervals newest first, page by page (1-based). */
  pageIntervals(resourceId: number, page: number, limit: number): Promise<OperatingTimelinePage>;

  /** Intervals that started or ended after `since`, earliest first. */
  findIntervalsActiveSince(resourceId: number, since: Date): Promise<OperatingIntervalRecord[]>;

  countOpenIntervals(resourceId: number): Promise<number>;

  /**
   * Operating/idle tracking nodes that act on the resource: its own, and for machines those of enabled global flows.
   */
  countTrackingNodes(resourceId: number, nodeTypes: readonly string[]): Promise<number>;
}
