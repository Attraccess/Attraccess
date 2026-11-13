import { AuditLog } from '@attraccess/database-entities';

import { ServiceUnavailableException, Logger } from '@nestjs/common';

import { getPluginAuditDomain } from '../../plugin-system/audit/audit-registry';

import { readAuditSettings, AuditSettings } from '../audit.config';

import { PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';

import { PreviousAuditSettings } from '../policies/administration';

import { AuditEvent, AuditRecordOptions } from '../recorder/audit-event';

import { auditDomainLabel, AuditRow, projectAuditRow } from '../recorder/audit-row';

import { DataSource, EntityManager } from 'typeorm';

import { AuditDropReason, AuditMetrics } from '../../metrics/definitions/audit.metrics';

import { SettingsStoreService } from '../../settings/settings-store.service';

/** Same wait as the resource-lifecycle connection: an audit write waits for the SQLite lock instead of being dropped. */
export const SQLITE_BUSY_TIMEOUT_MS = 5000;

/**
 * Extra attempts for an audit insert that waited out the busy timeout (SQLITE_BUSY). The lock holder can stall for
 * seconds under CPU starvation; the insert is a single statement that did not apply, so repeating it is safe.
 * Not used once shutdown has started, which keeps the drain inside Docker's stop grace period.
 */
export const AUDIT_BUSY_RETRIES = 2;

/** Writes without a caller transaction queue on the audit connection; beyond this they are dropped as `queue_full`. */
export const MAX_PENDING_AUDIT_WRITES = 1000;

/**
 * Shutdown waits this long for queued writes; whatever is still queued afterwards is dropped as `shutting_down`.
 * Plus one write already waiting on the lock (up to SQLITE_BUSY_TIMEOUT_MS), this stays inside Docker's default
 * 10 s stop grace period, so the process is not killed before it has logged and counted the rest.
 */
export const AUDIT_SHUTDOWN_DRAIN_MS = 4000;

/** One name is enough: audit savepoints on one connection never overlap (see insertInTransaction). */
const AUDIT_SAVEPOINT = 'attraccess_audit_record';

const SAFE_LOGGED_ACTION = /^[a-z0-9][a-z0-9_.-]{0,99}$/i;

class SettingsUnavailableError extends Error {}

/**
 * The caller's transaction no longer exists: SQLite rolled all of it back (e.g. SQLITE_FULL or SQLITE_IOERR),
 * so the savepoint could not be rolled back. Thrown so the caller aborts instead of continuing in autocommit.
 */
export class AuditTransactionAbortedError extends Error {
  constructor(readonly code: string | undefined) {
    super(`The caller's transaction was rolled back by SQLite while writing an audit record (${code ?? 'unknown'})`);
    this.name = 'AuditTransactionAbortedError';
  }
}

/**
 * A successful change that turns recording off is its own final event. The exception is restricted to audit
 * settings and the caller's previously enabled administration policy.
 */
export function finalSettingsChange(row: AuditRow, previous: PreviousAuditSettings | undefined): boolean {
  return (
    row.domain === 'administration' &&
    row.action === 'settings.updated' &&
    String(row.details.settingKey).startsWith('audit.') &&
    previous?.enabled === true &&
    previous.domains.includes('administration')
  );
}

/** Only the SQLite result code is safe to log; the driver message may contain SQL parameters. */
export function sqliteErrorCode(error: unknown): string | undefined {
  const candidates = [
    (error as { code?: unknown })?.code,
    (error as { driverError?: { code?: unknown } })?.driverError?.code,
  ];
  return candidates.find((code): code is string => typeof code === 'string' && /^SQLITE_[A-Z_]+$/.test(code));
}

export function auditCutoff(retentionDays: number): Date {
  return new Date(Date.now() - retentionDays * 86_400_000);
}

/** Legacy password-policy rows keep oversized details in this table, when it exists. */
export async function hasPasswordPolicyOverflow(storage: DataSource): Promise<boolean> {
  const rows = await storage.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'password_policy_audit_overflow' LIMIT 1",
  );
  return rows.some((row: { name?: unknown }) => row.name === 'password_policy_audit_overflow');
}

/** The audit connection and its write queue, shared by AuditService's lifecycle hooks and AuditStorage. */
export class AuditStorageState {
  storage?: DataSource;

  stopping = false;

  /** Set when the shutdown drain timed out: queued writes are then dropped as `shutting_down`. */
  drainExpired = false;

  pending = 0;

  activeReads = 0;

  cleaning = false;

  writeTail: Promise<void> = Promise.resolve();
}

/** Writes and reads audit records on the audit connection, honouring the audit settings. */
export class AuditStorage {
  constructor(
    private readonly settings: SettingsStoreService,
    private readonly metrics: AuditMetrics,
    private readonly logger: Logger,
    private readonly state: AuditStorageState,
  ) {}

  /** Tail of the in-transaction audit writes per connection; see insertInTransaction. */
  private readonly savepointQueues = new WeakMap<DataSource, Promise<unknown>>();

  /**
   * The AuditRecorder port: validates the envelope against its domain policy and stores it. Never rejects,
   * except with AuditTransactionAbortedError (see recordSnapshot).
   */
  async record(
    event: AuditEvent,
    manager?: EntityManager,
    options: AuditRecordOptions = {},
  ): Promise<PluginAuditReceipt> {
    const row = this.project(() => projectAuditRow(event));
    if (!row)
      return this.drop(
        this.project(() => auditDomainLabel(event)),
        'invalid_event',
        this.project(() => event.action),
      );
    return this.recordSnapshot(row, {
      finalSettingsChange: finalSettingsChange(row, options.previousAuditSettings),
      transaction: manager,
    });
  }

  /** Runs a read on the audit connection; shutdown waits for it. */
  async read<T>(query: (storage: DataSource) => Promise<T>): Promise<T> {
    const storage = this.state.storage;
    if (this.state.stopping || !storage?.isInitialized)
      throw new ServiceUnavailableException('Audit storage unavailable');
    this.state.activeReads++;
    try {
      return await query(storage);
    } finally {
      this.state.activeReads--;
    }
  }

  /** Runs an event projection; a projection that throws is treated like one that rejects the event. */
  private project<T>(projection: () => T | null | undefined): T | undefined {
    try {
      return projection() ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Stores one audit row and never rejects. With an active caller transaction the row is inserted in a
   * savepoint of that transaction: it commits or rolls back with the caller's change, and a failed insert
   * only rolls back the savepoint. Without one it is written on the separate audit connection.
   * Every write that is not stored (other than disabled audit or domain) is logged and counted.
   * The one exception to "never rejects": AuditTransactionAbortedError, when SQLite already discarded the caller's
   * whole transaction, so the caller must not continue as if it were still open.
   */
  private async recordSnapshot(
    event: AuditRow,
    { finalSettingsChange = false, transaction }: { finalSettingsChange?: boolean; transaction?: EntityManager } = {},
  ): Promise<PluginAuditReceipt> {
    const { domain, action } = event;
    try {
      const callerTransaction = transaction?.queryRunner?.isTransactionActive ? transaction : undefined;
      if (callerTransaction) {
        // Runs on the caller's connection: no audit queue, no pending cap, no other connection to wait for.
        if (!(await this.auditEnabled(event, finalSettingsChange, callerTransaction))) return { status: 'unavailable' };
        return await this.insertInTransaction(callerTransaction, event);
      }
      if (this.state.stopping) return this.drop(domain, 'shutting_down', action);
      if (this.state.pending >= MAX_PENDING_AUDIT_WRITES) return this.drop(domain, 'queue_full', action);
      this.state.pending++;
      try {
        if (!(await this.auditEnabled(event, finalSettingsChange))) return { status: 'unavailable' };
        return await this.insertOnAuditConnection(event);
      } finally {
        this.state.pending--;
      }
    } catch (error) {
      if (error instanceof AuditTransactionAbortedError) throw error;
      return this.drop(
        domain,
        error instanceof SettingsUnavailableError ? 'settings_unavailable' : 'storage_error',
        action,
        error,
      );
    }
  }

  /**
   * False when audit or the event's domain is switched off (not a drop). Throws SettingsUnavailableError if unreadable.
   * Inside a caller transaction, uncached settings are read through it, so the transaction never waits on another connection.
   */
  private async auditEnabled(
    event: AuditRow,
    finalSettingsChange: boolean,
    transaction?: EntityManager,
  ): Promise<boolean> {
    let config: AuditSettings;
    try {
      config = await readAuditSettings(this.settings, transaction);
    } catch {
      throw new SettingsUnavailableError();
    }
    return finalSettingsChange || (config.enabled && this.domainEnabled(config, event.domain));
  }

  /**
   * Audit savepoints on one connection run one at a time. If two overlapped, SQLite's ROLLBACK TO for a failed
   * insert would also undo the other write's row after that write was reported as recorded.
   */
  private insertInTransaction(transaction: EntityManager, event: AuditRow): Promise<PluginAuditReceipt> {
    const connection = transaction.connection;
    const previous = this.savepointQueues.get(connection) ?? Promise.resolve();
    const insert = previous.then(() => this.insertInSavepoint(transaction, event));
    this.savepointQueues.set(
      connection,
      insert.catch(() => undefined),
    );
    return insert;
  }

  private async insertInSavepoint(transaction: EntityManager, event: AuditRow): Promise<PluginAuditReceipt> {
    // Explicit SQL savepoint instead of a nested TypeORM transaction: it leaves TypeORM's transaction depth and
    // transaction events alone, and it lets us tell a failed insert from a transaction SQLite discarded entirely.
    try {
      await transaction.query(`SAVEPOINT ${AUDIT_SAVEPOINT}`);
    } catch (error) {
      return this.drop(event.domain, 'storage_error', event.action, error);
    }
    try {
      await transaction.insert(AuditLog, { at: new Date(), ...event });
      await transaction.query(`RELEASE SAVEPOINT ${AUDIT_SAVEPOINT}`);
      return { status: 'recorded' };
    } catch (error) {
      try {
        await transaction.query(`ROLLBACK TO SAVEPOINT ${AUDIT_SAVEPOINT}`);
        await transaction.query(`RELEASE SAVEPOINT ${AUDIT_SAVEPOINT}`);
      } catch {
        this.drop(event.domain, 'storage_error', event.action, error);
        // TypeORM still believes the transaction is open. An empty transaction lets its rollback succeed and
        // reset that state, so the connection stays usable. Fails harmlessly if a transaction is somehow still open.
        await transaction.query('BEGIN').catch(() => undefined);
        throw new AuditTransactionAbortedError(sqliteErrorCode(error));
      }
      return this.drop(event.domain, 'storage_error', event.action, error);
    }
  }

  private async insertOnAuditConnection(event: AuditRow): Promise<PluginAuditReceipt> {
    return this.serializeStorageWrite<PluginAuditReceipt>(async () => {
      const storage = this.state.storage;
      // Writes admitted before shutdown still run; only a drain that ran out of time drops the rest.
      if (this.state.drainExpired) return this.drop(event.domain, 'shutting_down', event.action);
      if (!storage?.isInitialized) return this.drop(event.domain, 'storage_unavailable', event.action);
      for (let attempt = 0; ; attempt++) {
        try {
          await storage.getRepository(AuditLog).insert({ at: new Date(), ...event });
          return { status: 'recorded' };
        } catch (error) {
          const retry =
            sqliteErrorCode(error) === 'SQLITE_BUSY' && attempt < AUDIT_BUSY_RETRIES && !this.state.stopping;
          if (!retry) return this.drop(event.domain, 'storage_error', event.action, error);
        }
      }
    });
  }

  /** Logs and counts an audit record that was not stored. Never logs event data or the raw exception. */
  private drop(
    domain: string | undefined,
    reason: AuditDropReason,
    action?: string,
    error?: unknown,
  ): PluginAuditReceipt {
    const domainLabel = domain ?? 'unknown';
    const code = sqliteErrorCode(error);
    // Without a SQLite code, the error class name (never its message) still tells a driver error from a bug.
    const errorType = !code && error instanceof Error ? error.constructor.name : undefined;
    // A rejected event's action is caller input (plugins): only a short identifier is safe to put in a log line.
    const safeAction = typeof action === 'string' && SAFE_LOGGED_ACTION.test(action) ? action : undefined;
    const message = `Audit record dropped: domain=${domainLabel}${safeAction ? ` action=${safeAction}` : ''} reason=${reason}${
      code ? ` code=${code}` : ''
    }${errorType ? ` error=${errorType}` : ''}`;
    // Never log the event, SQLite parameters, or exception message (may contain secrets).
    if (reason === 'storage_error') this.logger.error(message);
    else this.logger.warn(message);
    this.metrics.recordsDropped.inc({ domain: domainLabel, reason });
    return { status: 'unavailable' };
  }

  /** Serializes every write on the audit storage connection, including cleanup transactions. */
  async serializeStorageWrite<T>(write: () => Promise<T>): Promise<T> {
    const precedingWrite = this.state.writeTail;
    let releaseWrite!: () => void;
    this.state.writeTail = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    try {
      await precedingWrite;
      return await write();
    } finally {
      releaseWrite();
    }
  }

  /** Core domains follow the configured allowlist; plugin domains record while registered unless explicitly disabled. */
  private domainEnabled(config: AuditSettings, domain: string): boolean {
    return getPluginAuditDomain(domain) !== undefined
      ? !config.plugin_domains_disabled.includes(domain)
      : (config.domains as readonly string[]).includes(domain);
  }

  sqliteDate(date: Date): string {
    return date.toISOString().replace('T', ' ').replace('Z', '');
  }
}
