import type {
  AuditEntry,
  AuditEntryDraft,
  AuditEntryFilter,
  AuditSubjectNameKind,
} from '@attraccess/application-models';
import type { SettingsStoreService } from '../settings/settings-store.service';

/** DI token of the audit persistence port; the persistence adapter provides it. */
export const AUDIT_STORE = Symbol.for('attraccess.audit.store');

/**
 * The caller's transaction was rolled back by the database while an audit record was written (for example disk
 * full), so the savepoint could not be rolled back. Thrown so the caller aborts instead of continuing in autocommit.
 */
export class AuditTransactionAbortedError extends Error {
  constructor(readonly code: string | undefined) {
    super(
      `The caller's transaction was rolled back by the database while writing an audit record (${code ?? 'unknown'})`,
    );
    this.name = 'AuditTransactionAbortedError';
  }
}

/** An active caller transaction the audit store can write into; created by the adapter, opaque to the application. */
export interface AuditTransaction {
  /** Lets uncached settings be read through the same transaction instead of waiting on another connection. */
  readonly settingsHandle: Parameters<SettingsStoreService['getPlainSetting']>[2];
}

export type AuditAppendResult =
  | { status: 'stored' }
  /** Not attempted: shutdown ran out of time, or there is no audit storage. */
  | { status: 'refused'; reason: 'shutting_down' | 'storage_unavailable' }
  /** Attempted and not stored; `code` is a driver result code that is safe to log. */
  | { status: 'failed'; error: unknown; code?: string };

export type AuditStoreOpenResult =
  | { status: 'ready' }
  /** The engine cannot offer an independent durable audit connection (for example an in-memory database). */
  | { status: 'unsupported' }
  | { status: 'failed'; code?: string; errorName?: string };

/** What the application tells a durable append about the process state; both are read at the moment of use. */
export interface DurableAppendControl {
  /** Checked once the append reached the front of the write order, right before it is written. */
  refusal(): 'shutting_down' | undefined;
  /** True once shutdown started: a busy audit write is then not repeated. */
  isStopping(): boolean;
}

/** Read side: the audit listing and the current names that label its subjects. */
export interface AuditEntryReader {
  /** Newest first (by id). Returns at most `limit` entries and whether more exist. Legacy details are hydrated. */
  findEntries(filter: AuditEntryFilter, limit: number): Promise<{ entries: AuditEntry[]; hasMore: boolean }>;
  /** Current display names (user name, resource name, ...) of the given ids; unknown ids are absent. */
  findCurrentNames(kind: AuditSubjectNameKind, ids: number[]): Promise<Map<number, string>>;
}

/**
 * Persistence of the audit log. Durability contract: `appendDurably` resolves `stored` only after the record is on
 * stable storage, written on a connection of its own that never shares a caller's transaction; durable appends keep
 * the order in which they were requested. `appendInTransaction` commits or rolls back with the caller's change.
 */
export interface AuditStore extends AuditEntryReader {
  /** Opens the durable audit connection. Safe to call again once open. */
  open(): Promise<AuditStoreOpenResult>;
  /** Closes the durable connection and refuses further durable appends. */
  close(): Promise<void>;
  readonly isOpen: boolean;
  /**
   * The active transaction behind a caller's scope, or undefined when the caller has none (the record is then
   * written durably). A TransactionScope of the unit of work and an adapter's native transaction handle both work.
   */
  activeTransaction(ref: object | undefined): AuditTransaction | undefined;
  /** Never rejects, except with AuditTransactionAbortedError. A failed insert leaves the caller's work intact. */
  appendInTransaction(transaction: AuditTransaction, entry: AuditEntryDraft): Promise<AuditAppendResult>;
  /** Never rejects. */
  appendDurably(entry: AuditEntryDraft, control: DurableAppendControl): Promise<AuditAppendResult>;
  /**
   * Deletes up to `limit` entries older than `cutoff` (with their legacy overflow rows) in one atomic step and returns
   * the number removed. Runs in the durable write order; returns 0 without deleting once `isStopping` is true.
   */
  deleteExpired(cutoff: Date, limit: number, isStopping: () => boolean): Promise<number>;
}
