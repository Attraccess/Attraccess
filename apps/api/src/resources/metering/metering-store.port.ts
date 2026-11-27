import type {
  MeteringBillableUsage,
  MeteringBillItemDraft,
  MeteringCorrectionDraft,
  MeteringCorrectionRecord,
  MeteringDefinitionFlow,
  MeteringLifecycleAttempt,
  MeteringUsageRecord,
  NewResourceMeteringOperation,
  NewResourceMeteringSession,
  MeterAllocationKind,
  ResourceMeterRecord,
  ResourceMeteringAccounting,
  ResourceMeteringOperationPatch,
  ResourceMeteringOperationRecord,
  ResourceMeteringSegmentPatch,
  ResourceMeteringSegmentRecord,
  ResourceMeteringSessionPatch,
  ResourceMeteringSessionRecord,
} from '@attraccess/application-models';
import type { TransactionContext } from '../../database/transaction-context';

/** DI token of the metering persistence port. */
export const METERING_STORE = Symbol.for('attraccess.resources.metering-store');

/** A meter of the resource already has this name. */
export class MeterNameTakenError extends Error {
  constructor() {
    super('METER_NAME_EXISTS');
    this.name = 'MeterNameTakenError';
  }
}

/** The usage a metering session belongs to, as far as segments are bounded by it. */
export type SegmentWindowUsage = Pick<MeteringUsageRecord, 'id' | 'startTime' | 'endTime'>;

/** A pending session picked out by what it may no longer be settled against. */
export interface PendingSessionFilter {
  resourceId?: number;
  /** Only sessions of usages that started before this one. */
  usageIdBelow?: number;
  /** Sessions with these accountings are not picked. */
  excludeAccounting: ResourceMeteringAccounting[];
}

export interface MeteringBillRef {
  id: number;
  userId: number;
}

/**
 * Persistence of meters, metering sessions, the operation ledger and shared segments, plus the bill lines a meter
 * writes. Every method takes the transaction a caller already holds (a `TransactionScope`); without one it reads or
 * writes on its own. The port expresses what metering needs, not how a table is laid out.
 */
export interface MeteringStore {
  // ---- meters and their flow definition -----------------------------------------------------------
  findDefinitionFlow(resourceId: number, context?: TransactionContext): Promise<MeteringDefinitionFlow>;
  /** The active meters of a resource; with `includeArchived` the archived ones too. */
  listMeters(
    resourceId: number,
    context?: TransactionContext,
    options?: { includeArchived?: boolean },
  ): Promise<ResourceMeterRecord[]>;
  /** Every active meter of every resource. */
  listAllMeters(context?: TransactionContext): Promise<ResourceMeterRecord[]>;
  findMeter(resourceId: number, meterId: number, context?: TransactionContext): Promise<ResourceMeterRecord | null>;
  findMeterById(meterId: number, context?: TransactionContext): Promise<ResourceMeterRecord | null>;
  resourceExists(resourceId: number, context?: TransactionContext): Promise<boolean>;
  /** Throws {@link MeterNameTakenError} for a name an active meter of the resource already uses. */
  createMeter(resourceId: number, name: string): Promise<ResourceMeterRecord>;
  /** Throws {@link MeterNameTakenError} when an active meter would get a name another one already uses. */
  renameMeter(resourceId: number, meterId: number, name: string): Promise<void>;
  /** Archives (a date) or restores (null). Restoring throws {@link MeterNameTakenError} on a name clash. */
  setMeterArchivedAt(meterId: number, archivedAt: Date | null, context: TransactionContext): Promise<void>;
  /**
   * The meter, locked against every write including new rows that refer to it, so nothing can appear between the
   * check for history and the deletion.
   */
  lockMeterForDeletion(
    resourceId: number,
    meterId: number,
    context: TransactionContext,
  ): Promise<ResourceMeterRecord | null>;
  /** Whether any metering session, operation or segment refers to the meter. */
  hasMeterRecords(meterId: number, context?: TransactionContext): Promise<boolean>;
  deleteMeter(meterId: number, context: TransactionContext): Promise<void>;
  setMeterRate(meterId: number, creditsPerUnit: number): Promise<void>;
  setMeterAllocation(meterId: number, allocation: MeterAllocationKind): Promise<void>;
  /** Accepts a reading on the meter: only the fields that are given change. */
  recordMeterObservation(
    meterId: number,
    patch: { lifetimeValue?: string; counterValue?: string | null; latestObservedAt?: Date },
    context?: TransactionContext,
  ): Promise<void>;

  // ---- usages and lifecycle attempts --------------------------------------------------------------
  /** The effective number of parallel sessions of the resource. */
  findSessionLimit(resourceId: number, context?: TransactionContext): Promise<number>;
  /** All published, running sessions of a machine, earliest first. */
  findRunningUsages(resourceId: number, context?: TransactionContext): Promise<MeteringUsageRecord[]>;
  findUsage(usageId: number, context?: TransactionContext): Promise<MeteringUsageRecord | null>;
  /** Every usage of the resource that has not ended, including a start that is still in progress. */
  findOpenUsages(resourceId: number, context?: TransactionContext): Promise<MeteringUsageRecord[]>;
  /** Waits until no session start or stop of the resource is deciding, and holds them off until commit. */
  lockUsageLifecycle(resourceId: number, context: TransactionContext): Promise<void>;
  findUsages(usageIds: number[], context?: TransactionContext): Promise<MeteringUsageRecord[]>;
  findBillableUsage(usageId: number, context?: TransactionContext): Promise<MeteringBillableUsage | null>;
  existsLifecycleAttempt(resourceId: number, context?: TransactionContext): Promise<boolean>;
  findLifecycleAttempt(
    attemptId: string,
    resourceId: number,
    context?: TransactionContext,
  ): Promise<MeteringLifecycleAttempt | null>;
  findAnyLifecycleAttempt(resourceId: number, context?: TransactionContext): Promise<MeteringLifecycleAttempt | null>;
  /**
   * Whether a usage of the resource started or ended since `requestedAt`, or a running one holds a metering session
   * of the meter: a reply for an idle collection must not cross such a boundary.
   */
  hasUsageBoundarySince(
    resourceId: number,
    meterId: number,
    requestedAt: Date,
    runningUsageIds: number[],
    context?: TransactionContext,
  ): Promise<boolean>;

  // ---- metering sessions ------------------------------------------------------------------------
  findSession(sessionId: string, context?: TransactionContext): Promise<ResourceMeteringSessionRecord | null>;
  findSessionOfResource(
    resourceId: number,
    sessionId: string,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord | null>;
  /** The meter sessions of the given usages that are still running (status active). */
  findRunningSessions(
    resourceId: number,
    usageIds: number[],
    meterIds: number[],
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord[]>;
  /** The running session of a usage for one meter on a resource. */
  findRunningSession(
    resourceId: number,
    meterId: number,
    usageId: number,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord | null>;
  /** Running sessions of the given usages that use the meter through segments or alone, i.e. not per session. */
  findSharingSessions(
    resourceId: number,
    meterId: number,
    usageIds: number[],
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord[]>;
  findRunningSessionsOfUsage(usageId: number, context?: TransactionContext): Promise<ResourceMeteringSessionRecord[]>;
  /** Running sessions of a usage that account through segments. */
  findSegmentedRunningSessionsOfUsage(
    usageId: number,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord[]>;
  findSegmentedPendingSessions(
    usageId: number,
    meterId: number,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord[]>;
  findSessionsOfUsage(usageId: number, context?: TransactionContext): Promise<ResourceMeteringSessionRecord[]>;
  /** Sessions that are pending or failed on a resource, newest first. */
  findUnsettledSessions(
    resourceId: number,
    limit: number,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord[]>;
  findPendingSessionIds(meterId: number, filter: PendingSessionFilter, context?: TransactionContext): Promise<string[]>;
  /** Whether a later usage than this one holds a metering session of the meter. */
  hasLaterSession(resourceId: number, meterId: number, usageId: number, context?: TransactionContext): Promise<boolean>;
  createSession(
    values: NewResourceMeteringSession,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord>;
  updateSession(sessionId: string, patch: ResourceMeteringSessionPatch, context?: TransactionContext): Promise<void>;
  deleteSession(sessionId: string, context?: TransactionContext): Promise<void>;
  deleteSessionsOfUsage(usageId: number, context?: TransactionContext): Promise<void>;
  /** Marks the unshared sessions a takeover took the meter from as unreliable. */
  markOwnSessionsCompromised(
    usageId: number,
    meterIds: number[],
    reason: string,
    context?: TransactionContext,
  ): Promise<void>;
  /** Sessions that took part in the open segment now account through segments. */
  markSessionsSegmented(sessionIds: string[], context?: TransactionContext): Promise<void>;
  /**
   * Fails the sessions and takes the "billed later" marker off their pending bill lines, which will never be
   * charged. Only the display data of the lines changes.
   */
  failSessions(sessionIds: string[], reason: string, context?: TransactionContext): Promise<void>;
  /** Waives a pending or failed session; null when it was neither (nothing changed). */
  waiveSession(
    resourceId: number,
    sessionId: string,
    at: Date,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord | null>;

  // ---- operation ledger -------------------------------------------------------------------------
  findOperation(operationId: string, context?: TransactionContext): Promise<ResourceMeteringOperationRecord | null>;
  /** A completed final operation of the session. */
  findCompletedFinalOperation(
    operationId: string,
    sessionId: string,
    context?: TransactionContext,
  ): Promise<ResourceMeteringOperationRecord | null>;
  createOperation(
    values: NewResourceMeteringOperation,
    context?: TransactionContext,
  ): Promise<ResourceMeteringOperationRecord>;
  updateOperation(
    operationId: string,
    patch: ResourceMeteringOperationPatch,
    context?: TransactionContext,
  ): Promise<void>;
  /** Ends an operation that is still pending; an answered one stays as it is. */
  closePendingOperation(operationId: string, status: 'failed' | 'expired', error: string, at: Date): Promise<void>;
  expirePendingOperations(error: string): Promise<void>;
  /** The owner of a usage, to address the person's own measuring point. */
  findUsageOwner(usageId: number, context?: TransactionContext): Promise<number | null>;

  // ---- shared segments --------------------------------------------------------------------------
  findSegment(segmentId: string, context?: TransactionContext): Promise<ResourceMeteringSegmentRecord | null>;
  findOpenSegment(meterId: number, context?: TransactionContext): Promise<ResourceMeteringSegmentRecord | null>;
  /** Open segments of one resource, or of all when no resource is named. */
  findOpenSegments(resourceId?: number, context?: TransactionContext): Promise<ResourceMeteringSegmentRecord[]>;
  /**
   * The segments of a meter a usage took part in, oldest first: closed and abandoned ones that ended during or after
   * the usage and began before it ended, and the open one.
   */
  findUsageSegments(
    meterId: number,
    usage: SegmentWindowUsage,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSegmentRecord[]>;
  createSegment(segment: ResourceMeteringSegmentRecord, context?: TransactionContext): Promise<void>;
  updateSegment(segmentId: string, patch: ResourceMeteringSegmentPatch, context?: TransactionContext): Promise<void>;
  /** The meter starts over: open segments can no longer get their closing reading. */
  abandonOpenSegments(meterId: number, at: Date, context?: TransactionContext): Promise<void>;

  // ---- bill lines -------------------------------------------------------------------------------
  /** The bill of a usage; the completed one when `completedOnly`. Throws when there is none. */
  requireBillOfUsage(usageId: number, completedOnly: boolean, context?: TransactionContext): Promise<MeteringBillRef>;
  hasBillItem(billId: number, externalReference: string, context?: TransactionContext): Promise<boolean>;
  addBillItem(billId: number, item: MeteringBillItemDraft, context?: TransactionContext): Promise<void>;
  /** A new, completed correction of an already completed bill. */
  createCorrection(draft: MeteringCorrectionDraft, context?: TransactionContext): Promise<MeteringCorrectionRecord>;
}
