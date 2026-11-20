import { Logger, ServiceUnavailableException } from '@nestjs/common';

import { PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';

import { AuditDropReason, AuditMetrics } from '../../metrics/definitions/audit.metrics';

import { getPluginAuditDomain } from '../../plugin-system/audit/audit-registry';

import { SettingsStoreService } from '../../settings/settings-store.service';

import { AuditSettings, readAuditSettings } from '../audit.config';

import {
  AuditEntryReader,
  AuditStore,
  AuditTransaction,
  AuditTransactionAbortedError,
} from '../audit-persistence.port';

import { PreviousAuditSettings } from '../policies/administration';

import { AuditEvent, AuditRecordOptions, AuditTransactionRef } from '../recorder/audit-event';

import { auditDomainLabel, AuditRow, projectAuditRow } from '../recorder/audit-row';

export { AuditTransactionAbortedError };

/** Writes without a caller transaction queue on the audit connection; beyond this they are dropped as `queue_full`. */
export const MAX_PENDING_AUDIT_WRITES = 1000;

/**
 * Shutdown waits this long for queued writes; whatever is still queued afterwards is dropped as `shutting_down`.
 * Plus one write already waiting on the lock (up to the busy timeout), this stays inside Docker's default
 * 10 s stop grace period, so the process is not killed before it has logged and counted the rest.
 */
export const AUDIT_SHUTDOWN_DRAIN_MS = 4000;

const SAFE_LOGGED_ACTION = /^[a-z0-9][a-z0-9_.-]{0,99}$/i;

class SettingsUnavailableError extends Error {}

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

export function auditCutoff(retentionDays: number): Date {
  return new Date(Date.now() - retentionDays * 86_400_000);
}

/** Lifecycle and write-queue state shared by AuditService's lifecycle hooks and AuditStorage. */
export class AuditStorageState {
  stopping = false;

  /** Set when the shutdown drain timed out: queued writes are then dropped as `shutting_down`. */
  drainExpired = false;

  pending = 0;

  activeReads = 0;

  cleaning = false;
}

/** Writes and reads audit records through the audit store, honouring the audit settings. */
export class AuditStorage {
  constructor(
    private readonly store: AuditStore,
    private readonly settings: SettingsStoreService,
    private readonly metrics: AuditMetrics,
    private readonly logger: Logger,
    private readonly state: AuditStorageState,
  ) {}

  /**
   * The AuditRecorder port: validates the envelope against its domain policy and stores it. Never rejects,
   * except with AuditTransactionAbortedError (see recordSnapshot).
   */
  async record(
    event: AuditEvent,
    transaction?: AuditTransactionRef,
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
      transaction,
    });
  }

  /** Runs a read on the audit connection; shutdown waits for it. */
  async read<T>(query: (reader: AuditEntryReader) => Promise<T>): Promise<T> {
    if (this.state.stopping || !this.store.isOpen) throw new ServiceUnavailableException('Audit storage unavailable');
    this.state.activeReads++;
    try {
      return await query(this.store);
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
   * The one exception to "never rejects": AuditTransactionAbortedError, when the database already discarded the
   * caller's whole transaction, so the caller must not continue as if it were still open.
   */
  private async recordSnapshot(
    event: AuditRow,
    {
      finalSettingsChange = false,
      transaction,
    }: { finalSettingsChange?: boolean; transaction?: AuditTransactionRef } = {},
  ): Promise<PluginAuditReceipt> {
    const { domain, action } = event;
    try {
      const callerTransaction = this.store.activeTransaction(transaction);
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
        return await this.insertDurably(event);
      } finally {
        this.state.pending--;
      }
    } catch (error) {
      if (error instanceof AuditTransactionAbortedError) {
        this.drop(domain, 'storage_error', action, { error, code: error.code });
        throw error;
      }
      return this.drop(
        domain,
        error instanceof SettingsUnavailableError ? 'settings_unavailable' : 'storage_error',
        action,
        { error },
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
    transaction?: AuditTransaction,
  ): Promise<boolean> {
    let config: AuditSettings;
    try {
      config = await readAuditSettings(this.settings, transaction);
    } catch {
      throw new SettingsUnavailableError();
    }
    return finalSettingsChange || (config.enabled && this.domainEnabled(config, event.domain));
  }

  private async insertInTransaction(transaction: AuditTransaction, event: AuditRow): Promise<PluginAuditReceipt> {
    const result = await this.store.appendInTransaction(transaction, event);
    if (result.status === 'stored') return { status: 'recorded' };
    return this.drop(event.domain, 'storage_error', event.action, result.status === 'failed' ? result : undefined);
  }

  private async insertDurably(event: AuditRow): Promise<PluginAuditReceipt> {
    const result = await this.store.appendDurably(event, {
      refusal: () => (this.state.drainExpired ? 'shutting_down' : undefined),
      isStopping: () => this.state.stopping,
    });
    if (result.status === 'stored') return { status: 'recorded' };
    if (result.status === 'refused') return this.drop(event.domain, result.reason, event.action);
    return this.drop(event.domain, 'storage_error', event.action, result);
  }

  /** Logs and counts an audit record that was not stored. Never logs event data or the raw exception. */
  private drop(
    domain: string | undefined,
    reason: AuditDropReason,
    action?: string,
    failure?: { error: unknown; code?: string },
  ): PluginAuditReceipt {
    const domainLabel = domain ?? 'unknown';
    const code = failure?.code;
    const error = failure?.error;
    // Without a driver code, the error class name (never its message) still tells a driver error from a bug.
    const errorType = !code && error instanceof Error ? error.constructor.name : undefined;
    // A rejected event's action is caller input (plugins): only a short identifier is safe to put in a log line.
    const safeAction = typeof action === 'string' && SAFE_LOGGED_ACTION.test(action) ? action : undefined;
    const message = `Audit record dropped: domain=${domainLabel}${safeAction ? ` action=${safeAction}` : ''} reason=${reason}${
      code ? ` code=${code}` : ''
    }${errorType ? ` error=${errorType}` : ''}`;
    // Never log the event, driver parameters, or exception message (may contain secrets).
    if (reason === 'storage_error') this.logger.error(message);
    else this.logger.warn(message);
    this.metrics.recordsDropped.inc({ domain: domainLabel, reason });
    return { status: 'unavailable' };
  }

  /** Core domains follow the configured allowlist; plugin domains record while registered unless explicitly disabled. */
  private domainEnabled(config: AuditSettings, domain: string): boolean {
    return getPluginAuditDomain(domain) !== undefined
      ? !config.plugin_domains_disabled.includes(domain)
      : (config.domains as readonly string[]).includes(domain);
  }
}
