import type { MaintenanceScheduleRecord } from '@attraccess/application-models';
import type { TransactionContext } from '../../database/transaction-context';

export const MAINTENANCE_EVALUATION_STORE = Symbol.for('attraccess.resources.maintenance-evaluation-store');

/** A schedule of a resource whose service cycle (baseline, running maintenance, completed sessions) is asked for. */
export interface ServiceCycleRequest {
  resourceId: number;
  scheduleId: number;
  /** The baseline when the schedule has not completed a maintenance yet: the creation of the resource. */
  createdAt: Date;
  /** Count the completed usage sessions since the baseline (USAGE_COUNT schedules). */
  countSessions: boolean;
}

export interface ServiceCycleState {
  resourceId: number;
  scheduleId: number;
  /** When the schedule's last maintenance ended, else the requested `createdAt`. */
  baseline: Date;
  /** A maintenance of the resource started and has no end yet. */
  hasActiveMaintenance: boolean;
  /** Completed usage sessions since the baseline; 0 unless the request asked for them. */
  completedSessions: number;
}

/**
 * What the schedule evaluator reads and writes inside one evaluation of a resource: the reads of an independent
 * snapshot or of a write transaction. `context` joins the view's reads and writes from other persistence ports
 * (maintenances, operating durations).
 */
export interface MaintenanceEvaluationView {
  readonly context: TransactionContext | undefined;
  enabledSchedules(resourceId: number): Promise<MaintenanceScheduleRecord[]>;
  /** When the schedule's last maintenance ended, else when the resource was created. */
  baselineDate(resourceId: number, scheduleId: number): Promise<Date>;
  /** Completed usage sessions of the resource that ended at or after `since`. */
  completedSessionCountSince(resourceId: number, since: Date): Promise<number>;
  /**
   * A fingerprint of every history change that can invalidate a duration calculation (new or open sessions,
   * operating intervals, lifecycle reservations). Equal fingerprints mean the same history.
   */
  durationFingerprint(resourceId: number): Promise<string>;
  /**
   * Runs `work` as a rollback-able part of the surrounding transaction. When `work` throws, only its own writes
   * are undone and the error is rethrown.
   */
  atomically<T>(name: string, work: () => Promise<T>): Promise<T>;
}

/**
 * Reads and writes of the maintenance schedule evaluator. The adapter owns the engine specifics: the bulk queries,
 * the date formats of stored timestamps, the independent read-only snapshot connection and the write transaction.
 */
export interface MaintenanceEvaluationStore {
  /**
   * True when evaluation can read committed history on its own connection and validate it inside a short write
   * transaction. Engines without that capability evaluate completely inside one transaction.
   */
  readonly snapshotReads: boolean;

  /** Reads on the application connection. */
  current(): MaintenanceEvaluationView;

  hasEnabledSchedules(resourceId: number): Promise<boolean>;
  listEnabledSchedules(): Promise<MaintenanceScheduleRecord[]>;
  /** Creation times of the resources that exist. */
  findResourceCreatedAt(resourceIds: number[]): Promise<Map<number, Date>>;
  /** The service cycle of each schedule of a resource, in bounded queries. */
  loadServiceCycleStates(requests: ServiceCycleRequest[], now: Date): Promise<ServiceCycleState[]>;

  /** Runs `work` against an independent, read-only view of the committed history. Needs `snapshotReads`. */
  inSnapshot<T>(work: (view: MaintenanceEvaluationView) => Promise<T>): Promise<T>;
  /** Runs `work` in one write transaction. */
  inTransaction<T>(work: (view: MaintenanceEvaluationView) => Promise<T>): Promise<T>;

  /** Releases the snapshot connection. The owner finishes active evaluations first. */
  close(): Promise<void>;
}
