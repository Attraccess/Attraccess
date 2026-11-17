import type {
  ResourceType,
  UsageBillingItemDraft,
  UsageLifecycleAttempt,
  UsageMeterRate,
  UsageSession,
  UsageSessionResource,
} from '@attraccess/application-models';
import type { SupervisionMode } from '@attraccess/application-models';
import type { ResourceUsageAction } from '@attraccess/application-models';
import type { TransactionContext } from '../../database/transaction-context';

export const USAGE_SESSION_STORE = Symbol.for('attraccess.usage.session-store');

/** A session that is reserved but not visible yet. The database fills in everything else. */
export interface PendingSessionDraft {
  resourceId: number;
  userId: number;
  startNotes: string | undefined;
  startTime: Date;
  sessionDurationCreditsPerMinute: number;
  operatingDurationCreditsPerMinute: number;
  creditsPerUsage: number;
  meterRates: UsageMeterRate[];
  supervisorUserId?: number;
  projectId?: number;
}

/** A door action is stored as an already ended session record. */
export interface DoorActionDraft {
  resourceId: number;
  userId: number;
  action: ResourceUsageAction;
}

/** An attempt carries billing items for a session whose bill does not exist (any more). */
export class MissingBillingTransactionError extends Error {
  constructor() {
    super('The usage billing transaction is missing');
    this.name = 'MissingBillingTransactionError';
  }
}

export interface SessionPage {
  data: UsageSession[];
  total: number;
}

export interface MachineCapacity {
  type: ResourceType;
  maxParallelSessions: number;
}

/**
 * Persistence of usage sessions and of the lifecycle attempts that reserve a machine while a session starts, stops
 * or is taken over.
 *
 * Guarantees the adapter keeps for concurrent writers, also across API instances sharing one database:
 *  - one stop or takeover attempt per running session and one attempt per tentative session (unique reservation);
 *  - a session ends at most once: `endSessionIfOpen` only changes a session that has no end yet, so a second
 *    finalization is detected (it reports `false`) instead of overwriting the first;
 *  - a tentative session is only ever deleted while it is still pending, never after it was published.
 *
 * Operations that take a `context` read or write inside the transaction the caller holds (a unit of work scope);
 * without one they use their own connection. External effects (device commands, payments, mails) never belong in
 * the work of a unit of work: it can be retried.
 */
export interface UsageSessionStore {
  /** The number of parallel sessions the resource allows. Doors and unknown resources behave like 1. */
  findSessionLimit(resourceId: number, context?: TransactionContext): Promise<number>;
  findMachineCapacity(resourceId: number): Promise<MachineCapacity | null>;

  /** Published sessions of one machine, earliest started first, with user, resource, bill, project and supervisor. */
  findActiveSessions(resourceId: number, context?: TransactionContext): Promise<UsageSession[]>;
  findActiveSessionsByResource(resourceIds: number[]): Promise<Map<number, UsageSession[]>>;
  countActiveSessions(resourceId: number, context?: TransactionContext): Promise<number>;
  /** The user's own usage session that has no end yet, published or still pending. */
  findOwnOpenSession(resourceId: number, userId: number, context?: TransactionContext): Promise<UsageSession | null>;
  /** Published sessions plus pending starts occupy a slot. Supervisors never take one. */
  findOccupyingUserIds(resourceId: number, context?: TransactionContext): Promise<number[]>;
  countOccupiedSlots(resourceId: number, context?: TransactionContext): Promise<number>;

  /** A published session with its details, or null. */
  findPublishedSession(resourceId: number, usageId: number): Promise<UsageSession | null>;
  findHistory(resourceId: number, page: number, limit: number, userId?: number): Promise<SessionPage>;
  findSessionForProjectChange(resourceId: number, usageId: number): Promise<UsageSession | null>;
  /** Moves an ended session to a project (or out of any) and returns it with resource, user and project. */
  assignProject(usage: UsageSession, project: { id: number } | null): Promise<UsageSession>;
  /** A session (published or not) with its resource and user, for the events that announce it. */
  findSessionForEvent(usageId: number, context?: TransactionContext): Promise<UsageSession | null>;
  /** The published session, unless it has ended or another stop is already ending it. */
  findEndableSession(resourceId: number, usageId: number, context?: TransactionContext): Promise<UsageSession | null>;
  /** The usage ids of the machine's sessions that a stop attempt is ending right now. */
  findSessionIdsBeingEnded(resourceId: number, context?: TransactionContext): Promise<Set<number>>;
  findMeterRates(resourceId: number, context?: TransactionContext): Promise<UsageMeterRate[]>;

  /** The resource a usage action targets, or null. */
  findResource(resourceId: number, context?: TransactionContext): Promise<UsageSessionResource | null>;
  /** The supervision mode of each of the resources that exist. */
  findSupervisionModes(resourceIds: number[]): Promise<Map<number, SupervisionMode | undefined>>;
  userExists(userId: number, context?: TransactionContext): Promise<boolean>;
  findGroupResourceIds(groupId: number): Promise<number[]>;
  /** The user's ended supervised sessions across the resources. */
  countCompletedSupervisedSessions(resourceIds: number[], userId: number): Promise<number>;

  /** Whether another lifecycle operation blocks this one (any on an exclusive machine, a takeover on a shared one). */
  isLifecycleBlocked(resourceId: number, sharedMachine: boolean, context?: TransactionContext): Promise<boolean>;
  findAttempt(
    attemptId: string,
    resourceId: number,
    context?: TransactionContext,
  ): Promise<UsageLifecycleAttempt | null>;
  /** Whether a stop or takeover attempt is already working on this running session. */
  isSessionBeingEnded(usageId: number, context?: TransactionContext): Promise<boolean>;
  saveAttempt(attempt: UsageLifecycleAttempt, context?: TransactionContext): Promise<UsageLifecycleAttempt>;
  deleteAttempt(attemptId: string, resourceId: number, context?: TransactionContext): Promise<void>;
  /** The attempt keeps its reservation, but it no longer has a tentative session. */
  clearAttemptCandidate(attemptId: string, resourceId: number, context?: TransactionContext): Promise<void>;
  /** Replaces the billing items staged on the attempt. */
  setBillingItems(attemptId: string, items: UsageBillingItemDraft[], context?: TransactionContext): Promise<void>;
  /** Attempt ids with their creation time, for the recovery of interrupted lifecycles. */
  listAttemptIds(): Promise<{ id: string; createdAt: Date }[]>;
  findAttemptsByIds(ids: string[], context?: TransactionContext): Promise<UsageLifecycleAttempt[]>;

  /** Reserves a session for a start or takeover: pending, never visible, with the owner's billing factor. */
  createPendingSession(draft: PendingSessionDraft, context?: TransactionContext): Promise<UsageSession>;
  /** The tentative session with relations, or null when it no longer exists. */
  findPendingSession(usageId: number, context?: TransactionContext): Promise<UsageSession | null>;
  /** Removes a tentative session. Reports whether one was removed; a published session is never touched. */
  deletePendingSession(usageId: number, context?: TransactionContext): Promise<boolean>;
  /** Makes the tentative session visible. */
  publishSession(usageId: number, context?: TransactionContext): Promise<void>;
  /** Ends a running session once. Reports `false` when it had already ended. */
  endSessionIfOpen(
    usageId: number,
    end: { endTime: Date; endNotes: string | null | undefined },
    context?: TransactionContext,
  ): Promise<boolean>;
  /** Stores the running time attributed to an ended session. */
  setAttributedOperatingDuration(usageId: number, minutes: number, context?: TransactionContext): Promise<void>;
  /** A session with the relations a stop, takeover or start returns. */
  findSessionWithRelations(
    usageId: number,
    shape: 'ended' | 'started',
    context?: TransactionContext,
  ): Promise<UsageSession>;
  /** Stores the forms and billing items an attempt carried, on the session's bill. */
  applyAttemptDrafts(attempt: UsageLifecycleAttempt, context?: TransactionContext): Promise<void>;
  recordDoorAction(draft: DoorActionDraft): Promise<UsageSession>;
  /** Cancels sessions that are neither pending nor finalized nor ended (impossible state). Returns how many. */
  recoverOrphanedSessions(context?: TransactionContext): Promise<number>;
}
