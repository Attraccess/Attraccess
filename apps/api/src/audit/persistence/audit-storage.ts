import { AuditLog } from '@attraccess/database-entities';

import { ServiceUnavailableException, Logger } from '@nestjs/common';

import { getRegisteredPluginAuditDomains, getPluginAuditDomain } from '../../plugin-system/audit/audit-registry';

import { CORE_AUDIT_DOMAINS } from '../policies/domains';

import { auditEntriesWithLabels } from '../policies/labels';

import { AuditQueryDto } from '../dto/audit-query.dto';

import { AuditMetaDto } from '../dto/audit-response.dto';

import { knownAuditActions, knownSubjectTypes } from '../policies/vocabulary';

import { readAuditSettings, AuditSettings } from '../audit.config';

import { PluginAuditEvent, PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';

import { projectPluginAuditEvent } from '../policies/plugins';

import { randomUUID } from 'crypto';

import {
  AdministrationAuditEvent,
  PreviousAuditSettings,
  projectAdministrationAuditEvent,
} from '../policies/administration';

import {
  ProjectAuditEvent,
  projectProjectAuditEvent,
  projectResourceAuditEvent,
  ResourceAuditEvent,
} from '../audit-policy';

import { DataSource, EntityManager } from 'typeorm';

import { AuditDropReason, AuditMetrics } from '../../metrics/definitions/audit.metrics';

import { SettingsStoreService } from '../../settings/settings-store.service';

export const billingStatuses = new Set(['pending', 'completed', 'failed']);

export const billingSources = new Set([
  'manual',
  'resource-usage',
  'refund',
  'sumup-topup',
  'energy-correction',
  'meter-correction',
]);

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

/** Only the SQLite result code is safe to log; the driver message may contain SQL parameters. */
export function sqliteErrorCode(error: unknown): string | undefined {
  const candidates = [
    (error as { code?: unknown })?.code,
    (error as { driverError?: { code?: unknown } })?.driverError?.code,
  ];
  return candidates.find((code): code is string => typeof code === 'string' && /^SQLITE_[A-Z_]+$/.test(code));
}

export interface BillingTransactionAuditEvent {
  transactionId: number;
  userId: number;
  initiatorId?: number | null;
  amount: number;
  status: string;
  previousStatus?: string;
  source: string;
}

export abstract class AuditStorage {
  /** Tail of the in-transaction audit writes per connection; see insertInTransaction. */
  private readonly savepointQueues = new WeakMap<DataSource, Promise<unknown>>();

  /** Current audit filter vocabulary: core values plus contributions from loaded plugins. */
  meta(): AuditMetaDto {
    return {
      domains: [
        ...CORE_AUDIT_DOMAINS.map((id) => ({ id, source: 'core' as const })),
        ...getRegisteredPluginAuditDomains().map(({ domain, labels }) => ({
          id: domain,
          source: 'plugin' as const,
          labels: { ...labels },
        })),
      ],
      subjectTypes: knownSubjectTypes(),
      actions: knownAuditActions(),
    };
  }

  async list(query: AuditQueryDto) {
    if (this.stopping || !this.storage?.isInitialized)
      throw new ServiceUnavailableException('Audit storage unavailable');
    this.activeReads++;
    try {
      const config = await readAuditSettings(this.settings);
      const limit = Math.min(100, Math.max(1, query.limit ?? 50));
      const builder = this.storage
        .getRepository(AuditLog)
        .createQueryBuilder('audit')
        .where('audit.at >= :cutoff', { cutoff: this.cutoff(config.retention_days) });
      for (const key of [
        'domain',
        'action',
        'outcome',
        'operationId',
        'actorId',
        'subjectId',
        'subjectType',
      ] as const) {
        if (query[key] !== undefined) builder.andWhere(`audit.${key} = :${key}`, { [key]: query[key] });
      }
      if (query.eventPrefix !== undefined)
        builder.andWhere('substr(audit.action, 1, :prefixLength) = :prefix', {
          prefixLength: query.eventPrefix.length,
          prefix: query.eventPrefix,
        });
      if (query.from !== undefined) builder.andWhere('audit.at >= :from', { from: new Date(query.from) });
      if (query.to !== undefined) builder.andWhere('audit.at <= :to', { to: new Date(query.to) });
      if (query.beforeId !== undefined) builder.andWhere('audit.id < :beforeId', { beforeId: query.beforeId });
      const rows = await builder
        .orderBy('audit.id', 'DESC')
        .take(limit + 1)
        .getMany();
      const hasMore = rows.length > limit;
      const retainedRows = rows.slice(0, limit);
      await this.hydrateLegacyPasswordPolicyDetails(retainedRows);
      const items = await auditEntriesWithLabels(this.source, retainedRows);
      return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
    } finally {
      this.activeReads--;
    }
  }

  protected async hasPasswordPolicyOverflow(): Promise<boolean> {
    const storage = this.storage;
    if (!storage) return false;
    const rows = await storage.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'password_policy_audit_overflow' LIMIT 1",
    );
    return rows.some((row: { name?: unknown }) => row.name === 'password_policy_audit_overflow');
  }

  /** Hydrate only legacy rows returned on this page; current audit event details stay bounded at write time. */
  protected async hydrateLegacyPasswordPolicyDetails(items: AuditLog[]): Promise<void> {
    const legacyIds = items
      .map((item) => {
        const legacyAuditId = Number(item.details.legacyAuditId);
        return Number.isSafeInteger(legacyAuditId) ? legacyAuditId : null;
      })
      .filter((id): id is number => id !== null);
    if (!legacyIds.length || !(await this.hasPasswordPolicyOverflow())) return;
    const storage = this.storage;
    if (!storage) return;
    const placeholders = legacyIds.map(() => '?').join(', ');
    const archived = await storage.query(
      `SELECT legacyAuditId, metadata FROM password_policy_audit_overflow WHERE legacyAuditId IN (${placeholders})`,
      legacyIds,
    );
    const metadata = new Map<string, Record<string, string | number | boolean | null>>();
    for (const row of archived) {
      try {
        const legacyAuditId = Number(row.legacyAuditId ?? row.legacyauditid);
        const value = JSON.parse(String(row.metadata));
        if (Number.isSafeInteger(legacyAuditId) && value && typeof value === 'object' && !Array.isArray(value))
          metadata.set(String(legacyAuditId), value);
      } catch {
        // A malformed archive must not make the audit list unavailable.
      }
    }
    for (const item of items) {
      const legacyId = item.details.legacyAuditId;
      if (Number.isSafeInteger(legacyId) && metadata.has(String(legacyId)))
        item.details = { ...item.details, ...metadata.get(String(legacyId)) };
    }
  }

  /** Host bridge for plugin audit events: validated against the recording plugin's registered domain declaration. */
  async record(
    event: PluginAuditEvent & { pluginId: string },
    transaction?: EntityManager,
  ): Promise<PluginAuditReceipt> {
    const snapshot = this.project(() => projectPluginAuditEvent(event));
    // The domain is unknown here: projection failed before the plugin's declaration was resolved.
    if (!snapshot) return this.drop(undefined, 'invalid_event');
    return this.recordSnapshot(
      {
        domain: snapshot.domain,
        pluginId: snapshot.pluginId,
        action: snapshot.action,
        operationId: snapshot.operationId,
        actorId: snapshot.actorId,
        authenticationMethod: snapshot.authenticationMethod,
        apiTokenId: snapshot.apiTokenId ?? null,
        outcome: snapshot.outcome,
        subjectType: snapshot.subjectType,
        subjectId: snapshot.subjectId,
        ipAddress: null,
        userAgent: null,
        details: snapshot.details,
      },
      { transaction },
    );
  }

  /** Runs an event projection; a projection that throws is treated like one that rejects the event. */
  protected project<T>(projection: () => T | null | undefined): T | undefined {
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
  protected async recordSnapshot(
    event: Omit<AuditLog, 'id' | 'at'>,
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
      if (this.stopping) return this.drop(domain, 'shutting_down', action);
      if (this.pending >= MAX_PENDING_AUDIT_WRITES) return this.drop(domain, 'queue_full', action);
      this.pending++;
      try {
        if (!(await this.auditEnabled(event, finalSettingsChange))) return { status: 'unavailable' };
        return await this.insertOnAuditConnection(event);
      } finally {
        this.pending--;
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
    event: Omit<AuditLog, 'id' | 'at'>,
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
  private insertInTransaction(
    transaction: EntityManager,
    event: Omit<AuditLog, 'id' | 'at'>,
  ): Promise<PluginAuditReceipt> {
    const connection = transaction.connection;
    const previous = this.savepointQueues.get(connection) ?? Promise.resolve();
    const insert = previous.then(() => this.insertInSavepoint(transaction, event));
    this.savepointQueues.set(
      connection,
      insert.catch(() => undefined),
    );
    return insert;
  }

  private async insertInSavepoint(
    transaction: EntityManager,
    event: Omit<AuditLog, 'id' | 'at'>,
  ): Promise<PluginAuditReceipt> {
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

  private async insertOnAuditConnection(event: Omit<AuditLog, 'id' | 'at'>): Promise<PluginAuditReceipt> {
    return this.serializeStorageWrite<PluginAuditReceipt>(async () => {
      const storage = this.storage;
      // Writes admitted before shutdown still run; only a drain that ran out of time drops the rest.
      if (this.drainExpired) return this.drop(event.domain, 'shutting_down', event.action);
      if (!storage?.isInitialized) return this.drop(event.domain, 'storage_unavailable', event.action);
      for (let attempt = 0; ; attempt++) {
        try {
          await storage.getRepository(AuditLog).insert({ at: new Date(), ...event });
          return { status: 'recorded' };
        } catch (error) {
          const retry = sqliteErrorCode(error) === 'SQLITE_BUSY' && attempt < AUDIT_BUSY_RETRIES && !this.stopping;
          if (!retry) return this.drop(event.domain, 'storage_error', event.action, error);
        }
      }
    });
  }

  /** Logs and counts an audit record that was not stored. Never logs event data or the raw exception. */
  protected drop(
    domain: string | undefined,
    reason: AuditDropReason,
    action?: string,
    error?: unknown,
  ): PluginAuditReceipt {
    const domainLabel = domain ?? 'unknown';
    const code = sqliteErrorCode(error);
    // Without a SQLite code, the error class name (never its message) still tells a driver error from a bug.
    const errorType = !code && error instanceof Error ? error.constructor.name : undefined;
    const message = `Audit record dropped: domain=${domainLabel}${action ? ` action=${action}` : ''} reason=${reason}${
      code ? ` code=${code}` : ''
    }${errorType ? ` error=${errorType}` : ''}`;
    // Never log the event, SQLite parameters, or exception message (may contain secrets).
    if (reason === 'storage_error') this.logger.error(message);
    else this.logger.warn(message);
    this.metrics.recordsDropped.inc({ domain: domainLabel, reason });
    return { status: 'unavailable' };
  }

  /** Serializes every write on the audit storage connection, including cleanup transactions. */
  protected async serializeStorageWrite<T>(write: () => Promise<T>): Promise<T> {
    const precedingWrite = this.writeTail;
    let releaseWrite!: () => void;
    this.writeTail = new Promise<void>((resolve) => {
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
  protected domainEnabled(config: AuditSettings, domain: string): boolean {
    return getPluginAuditDomain(domain) !== undefined
      ? !config.plugin_domains_disabled.includes(domain)
      : (config.domains as readonly string[]).includes(domain);
  }

  protected cutoff(retentionDays: number): Date {
    return new Date(Date.now() - retentionDays * 86_400_000);
  }

  protected sqliteDate(date: Date): string {
    return date.toISOString().replace('T', ' ').replace('Z', '');
  }

  /** Billing events are projected from scalar transaction fields only, never provider payloads. */
  async recordBillingTransaction(
    event: BillingTransactionAuditEvent,
    transaction?: EntityManager,
  ): Promise<PluginAuditReceipt> {
    const actorId = event.initiatorId ?? event.userId;
    if (
      !Number.isSafeInteger(event.transactionId) ||
      event.transactionId <= 0 ||
      !Number.isSafeInteger(event.userId) ||
      event.userId <= 0 ||
      !Number.isSafeInteger(event.amount) ||
      !billingStatuses.has(event.status) ||
      (event.previousStatus !== undefined && !billingStatuses.has(event.previousStatus)) ||
      !billingSources.has(event.source) ||
      !Number.isSafeInteger(actorId) ||
      actorId <= 0
    )
      return this.drop('billing', 'invalid_event');
    return this.recordSnapshot(
      {
        domain: 'billing',
        pluginId: 'billing',
        action: event.previousStatus === undefined ? 'billing.transaction.created' : 'billing.transaction.updated',
        operationId: `billing-transaction-${event.transactionId}`,
        actorId,
        authenticationMethod: 'session',
        apiTokenId: null,
        outcome: 'succeeded',
        subjectType: 'billing.transaction',
        subjectId: event.transactionId,
        ipAddress: null,
        userAgent: null,
        details: {
          amount: event.amount,
          status: event.status,
          ...(event.previousStatus === undefined ? {} : { previousStatus: event.previousStatus }),
          source: event.source,
        },
      },
      { transaction },
    );
  }

  async recordResource(event: Omit<ResourceAuditEvent, 'operationId'>, transaction?: EntityManager): Promise<boolean> {
    const snapshot = this.project(() => projectResourceAuditEvent({ ...event, operationId: randomUUID() }));
    if (!snapshot) {
      this.drop('resource', 'invalid_event');
      return false;
    }
    const receipt = await this.recordSnapshot(
      {
        domain: 'resource',
        pluginId: 'core',
        action: snapshot.action,
        operationId: snapshot.operationId,
        actorId: snapshot.actorId,
        authenticationMethod:
          snapshot.authenticationMethod === undefined
            ? snapshot.actorId === null
              ? null
              : 'session'
            : snapshot.authenticationMethod,
        apiTokenId: snapshot.apiTokenId ?? null,
        outcome: 'succeeded',
        subjectType: snapshot.subjectType ?? 'resource',
        subjectId: snapshot.subjectId,
        ipAddress: null,
        userAgent: null,
        details: snapshot.details,
      },
      { transaction },
    );
    return receipt.status === 'recorded';
  }

  /** Records only reviewed scalar administration metadata; callers must never pass request bodies. */
  async recordAdministration(
    event: AdministrationAuditEvent,
    previousAuditSettings?: PreviousAuditSettings,
    transaction?: EntityManager,
  ): Promise<PluginAuditReceipt> {
    const snapshot = this.project(() => projectAdministrationAuditEvent(event));
    if (!snapshot) return this.drop('administration', 'invalid_event');
    // A successful change that turns recording off is its own final event. The exception
    // is restricted to audit settings and the caller's previously enabled administration policy.
    const finalSettingsChange =
      snapshot.action === 'settings.updated' &&
      String(snapshot.details.settingKey).startsWith('audit.') &&
      previousAuditSettings?.enabled === true &&
      previousAuditSettings.domains.includes('administration');
    return this.recordSnapshot(
      {
        domain: 'administration',
        pluginId: 'core',
        action: snapshot.action,
        operationId: snapshot.operationId ?? randomUUID(),
        actorId: snapshot.actorId,
        authenticationMethod: snapshot.authenticationMethod ?? 'session',
        apiTokenId: snapshot.apiTokenId ?? null,
        outcome: snapshot.outcome ?? 'succeeded',
        subjectType: snapshot.subjectType,
        subjectId: snapshot.subjectId,
        details: snapshot.details,
        ipAddress: null,
        userAgent: null,
      },
      { finalSettingsChange, transaction },
    );
  }

  async recordProject(event: Omit<ProjectAuditEvent, 'operationId'>, transaction?: EntityManager): Promise<void> {
    const snapshot = this.project(() => projectProjectAuditEvent({ ...event, operationId: randomUUID() }));
    if (!snapshot) {
      this.drop('project', 'invalid_event');
      return;
    }
    await this.recordSnapshot(
      {
        domain: 'project',
        pluginId: 'core',
        action: snapshot.action,
        operationId: snapshot.operationId,
        actorId: snapshot.actorId,
        authenticationMethod: snapshot.authenticationMethod ?? 'session',
        apiTokenId: snapshot.apiTokenId ?? null,
        outcome: 'succeeded',
        subjectType: snapshot.subjectType,
        subjectId: snapshot.subjectId,
        ipAddress: null,
        userAgent: null,
        details: snapshot.details,
      },
      { transaction },
    );
  }

  protected abstract readonly logger: Logger;

  protected abstract readonly metrics: AuditMetrics;

  protected abstract storage?: DataSource;

  protected abstract stopping: boolean;

  protected abstract drainExpired: boolean;

  protected abstract pending: number;

  protected abstract readonly settings: SettingsStoreService;

  protected abstract readonly source: DataSource;

  protected abstract writeTail: Promise<void>;

  protected abstract activeReads: number;

  protected abstract cleaning: boolean;
}
