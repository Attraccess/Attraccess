import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  DataSource,
  EntityManager,
  EntitySubscriberInterface,
  QueryRunner,
  TransactionCommitEvent,
  TransactionRollbackEvent,
} from 'typeorm';
import { AuditLog } from '@attraccess/database-entities';
import { PluginAuditEvent, PluginAuditHostProvider, PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';
import { readAuditSettings } from './audit.config';
import { SettingsStoreService } from '../settings/settings-store.service';
import {
  IdentityAuditEvent,
  projectAuditEvent,
  projectIdentityAuditEvent,
  projectResourceAuditEvent,
  ResourceAuditEvent,
} from './audit-policy';
import { AuditQueryDto } from './audit-query.dto';
import { randomUUID } from 'crypto';
import { auditEntriesWithLabels } from './audit-labels';
import {
  AdministrationAuditEvent,
  PreviousAuditSettings,
  projectAdministrationAuditEvent,
} from './audit-administration-policy';

const billingStatuses = new Set(['pending', 'completed', 'failed']);
const billingSources = new Set(['manual', 'resource-usage', 'refund', 'sumup-topup']);
const SQLITE_BUSY_TIMEOUT_MS = 10;
const SQLITE_CONTENTION_RECOVERY_DELAY_MS = 500;

export interface BillingTransactionAuditEvent {
  transactionId: number;
  userId: number;
  initiatorId?: number | null;
  amount: number;
  status: string;
  previousStatus?: string;
  source: string;
}

@Injectable()
export class AuditService implements PluginAuditHostProvider, EntitySubscriberInterface, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  private stopping = false;
  private activeReads = 0;
  private storage?: DataSource;
  private pending = 0;
  private cleaning = false;
  private writeTail: Promise<void> = Promise.resolve();
  private contended = false;
  private subscribed = false;
  private readonly billingEvents = new WeakMap<
    QueryRunner,
    Array<{
      event: BillingTransactionAuditEvent;
      transactionDepth: number;
      resolve: (receipt: PluginAuditReceipt) => void;
    }>
  >();

  constructor(
    private readonly source: DataSource,
    private readonly settings: SettingsStoreService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.storage?.isInitialized || this.stopping) return;
    this.source.subscribers.push(this);
    this.subscribed = true;
    // A separate connection guarantees that a receipt follows autocommit, never a
    // savepoint in the application's shared SQLite transaction. No schema sync.
    if (this.source.options.type !== 'sqlite' || this.source.options.database === ':memory:') return;
    const storage = new DataSource({
      type: 'sqlite',
      database: this.source.options.database,
      entities: [AuditLog],
      synchronize: false,
      migrationsRun: false,
      logging: false,
      busyTimeout: 10,
    });
    try {
      await storage.initialize();
      await storage.query(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
      await storage.query('PRAGMA synchronous = FULL');
      this.storage = storage;
      await this.cleanup();
    } catch {
      if (storage.isInitialized) await storage.destroy().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.subscribed) this.source.subscribers.splice(this.source.subscribers.indexOf(this), 1);
    while (this.pending || this.cleaning || this.activeReads) await new Promise((resolve) => setTimeout(resolve, 5));
    const storage = this.storage;
    this.storage = undefined;
    if (storage?.isInitialized) await storage.destroy().catch(() => undefined);
  }

  async record(event: PluginAuditEvent & { pluginId: string }): Promise<PluginAuditReceipt> {
    try {
      const snapshot = projectAuditEvent(event);
      if (!snapshot) return { status: 'unavailable' };
      return await this.recordSnapshot({
        domain: 'wago',
        pluginId: snapshot.pluginId,
        action: snapshot.action,
        operationId: snapshot.operationId,
        actorId: snapshot.principal.userId,
        authenticationMethod: snapshot.principal.authenticationMethod,
        apiTokenId: snapshot.principal.apiTokenId ?? null,
        outcome: snapshot.outcome,
        subjectType: snapshot.subject.type,
        subjectId: snapshot.subject.id,
        ipAddress: null,
        userAgent: null,
        details: snapshot.details as Record<string, string | number>,
      });
    } catch {
      // Never log the event, SQLite parameters, or exception (may contain secrets).
      return { status: 'unavailable' };
    }
  }

  /** Billing events are projected from scalar transaction fields only, never provider payloads. */
  async recordBillingTransaction(event: BillingTransactionAuditEvent): Promise<PluginAuditReceipt> {
    try {
      if (
        !Number.isSafeInteger(event.transactionId) ||
        event.transactionId <= 0 ||
        !Number.isSafeInteger(event.userId) ||
        event.userId <= 0 ||
        !Number.isSafeInteger(event.amount) ||
        !billingStatuses.has(event.status) ||
        (event.previousStatus !== undefined && !billingStatuses.has(event.previousStatus)) ||
        !billingSources.has(event.source)
      )
        return { status: 'unavailable' };
      const actorId = event.initiatorId ?? event.userId;
      if (!Number.isSafeInteger(actorId) || actorId <= 0) return { status: 'unavailable' };
      return await this.recordSnapshot({
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
      });
    } catch {
      return { status: 'unavailable' };
    }
  }

  async recordIdentity(event: IdentityAuditEvent): Promise<PluginAuditReceipt> {
    try {
      const snapshot = projectIdentityAuditEvent(event);
      if (!snapshot) return { status: 'unavailable' };
      return await this.recordSnapshot({
        domain: 'identity',
        pluginId: null,
        action: snapshot.action,
        operationId: snapshot.operationId,
        actorId: snapshot.actorId,
        authenticationMethod: snapshot.authenticationMethod,
        apiTokenId: snapshot.apiTokenId,
        outcome: snapshot.outcome,
        subjectType: snapshot.subjectType,
        subjectId: snapshot.subjectId,
        ipAddress: snapshot.ipAddress,
        userAgent: snapshot.userAgent,
        details: snapshot.details,
      });
    } catch {
      return { status: 'unavailable' };
    }
  }

  /** Defers billing audit writes until the supplied transaction has committed. */
  recordBillingTransactionAfterCommit(
    event: BillingTransactionAuditEvent,
    transactionManager?: EntityManager,
  ): Promise<PluginAuditReceipt> {
    const queryRunner = transactionManager?.queryRunner;
    if (!queryRunner?.isTransactionActive) return this.recordBillingTransaction(event);
    return new Promise((resolve) => {
      const events = this.billingEvents.get(queryRunner) ?? [];
      events.push({ event, transactionDepth: this.transactionDepth(queryRunner), resolve });
      this.billingEvents.set(queryRunner, events);
    });
  }

  async recordResource(event: Omit<ResourceAuditEvent, 'operationId'>): Promise<void> {
    try {
      const snapshot = projectResourceAuditEvent({ ...event, operationId: randomUUID() });
      const storage = this.storage;
      if (!snapshot || this.stopping || !storage?.isInitialized || this.pending >= 8) return;
      this.pending++;
      try {
        const config = await readAuditSettings(this.settings);
        if (!config.enabled || !config.domains.includes('resource') || this.stopping) return;
        await this.serializeStorageWrite(() =>
          storage.getRepository(AuditLog).insert({
            at: new Date(),
            domain: 'resource',
            pluginId: 'core',
            action: snapshot.action,
            operationId: snapshot.operationId,
            actorId: snapshot.actorId,
            authenticationMethod: snapshot.actorId === null ? null : (snapshot.authenticationMethod ?? 'session'),
            apiTokenId: snapshot.apiTokenId ?? null,
            outcome: 'succeeded',
            subjectType: snapshot.subjectType ?? 'resource',
            subjectId: snapshot.subjectId,
            details: snapshot.details,
          }),
        );
      } finally {
        this.pending--;
      }
    } catch {
      /* Audit persistence must not affect resource operations. */
    }
  }

  /** Records only reviewed scalar administration metadata; callers must never pass request bodies. */
  async recordAdministration(
    event: AdministrationAuditEvent,
    previousAuditSettings?: PreviousAuditSettings,
  ): Promise<PluginAuditReceipt> {
    try {
      const snapshot = projectAdministrationAuditEvent(event);
      if (!snapshot) return { status: 'unavailable' };
      // A successful change that turns recording off is its own final event. The exception
      // is restricted to audit settings and the caller's previously enabled administration policy.
      const finalSettingsChange =
        snapshot.action === 'settings.updated' &&
        String(snapshot.details.settingKey).startsWith('audit.') &&
        previousAuditSettings?.enabled === true &&
        previousAuditSettings.domains.includes('administration');
      return await this.recordSnapshot(
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
        finalSettingsChange,
      );
    } catch {
      // Audit persistence must not affect administration operations.
      return { status: 'unavailable' };
    }
  }

  afterTransactionCommit({ queryRunner }: TransactionCommitEvent): void {
    // Nested transaction commits release a savepoint; wait for the owning transaction.
    if (queryRunner.isTransactionActive) {
      const transactionDepth = this.transactionDepth(queryRunner);
      for (const event of this.billingEvents.get(queryRunner) ?? []) {
        event.transactionDepth = Math.min(event.transactionDepth, transactionDepth);
      }
      return;
    }
    const events = this.billingEvents.get(queryRunner);
    if (!events) return;
    this.billingEvents.delete(queryRunner);
    for (const { event, resolve } of events) void this.recordBillingTransaction(event).then(resolve);
  }

  afterTransactionRollback({ queryRunner }: TransactionRollbackEvent): void {
    const events = this.billingEvents.get(queryRunner);
    if (!events) return;
    const transactionDepth = this.transactionDepth(queryRunner);
    const retainedEvents = events.filter((event) => event.transactionDepth <= transactionDepth);
    for (const event of events) {
      if (event.transactionDepth > transactionDepth) event.resolve({ status: 'unavailable' });
    }
    if (retainedEvents.length) this.billingEvents.set(queryRunner, retainedEvents);
    else this.billingEvents.delete(queryRunner);
  }

  private transactionDepth(queryRunner: QueryRunner): number {
    return (queryRunner as QueryRunner & { transactionDepth: number }).transactionDepth;
  }

  private async recordSnapshot(
    event: Omit<AuditLog, 'id' | 'at'>,
    finalSettingsChange = false,
  ): Promise<PluginAuditReceipt> {
    if (this.stopping || !this.storage?.isInitialized || this.pending >= 8) return { status: 'unavailable' };
    if (this.source.createQueryRunner().isTransactionActive) return { status: 'unavailable' };
    this.pending++;
    try {
      const config = await readAuditSettings(this.settings);
      if (
        (!finalSettingsChange &&
          (!config.enabled ||
            !config.domains.includes(event.domain as 'administration' | 'billing' | 'identity' | 'resource' | 'wago'))) ||
        this.stopping
      )
        return { status: 'unavailable' };
      const unavailable = await this.serializeStorageWrite<PluginAuditReceipt | undefined>(async () => {
        if (this.contended) {
          // Drop the already-admitted burst, then give the first later write a short chance
          // to observe a released SQLite lock without reviving the whole stale burst.
          if (this.pending > 1) return { status: 'unavailable' };
          await new Promise<void>((resolve) => setTimeout(resolve, SQLITE_CONTENTION_RECOVERY_DELAY_MS));
          this.contended = false;
        }
        try {
          await this.storage.getRepository(AuditLog).insert({ at: new Date(), ...event });
        } catch {
          this.contended = true;
          return { status: 'unavailable' };
        }
      });
      if (unavailable) return unavailable;
      return { status: 'recorded' };
    } finally {
      this.pending--;
    }
  }

  private cutoff(retentionDays: number): Date {
    return new Date(Date.now() - retentionDays * 86_400_000);
  }

  private sqliteDate(date: Date): string {
    return date.toISOString().replace('T', ' ').replace('Z', '');
  }

  /** Serializes every write on the audit storage connection, including cleanup transactions. */
  private async serializeStorageWrite<T>(write: () => Promise<T>): Promise<T> {
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

  @Interval(60 * 60 * 1000)
  async cleanup(): Promise<void> {
    const storage = this.storage;
    if (this.stopping || !storage?.isInitialized || this.cleaning) return;
    this.cleaning = true;
    try {
      const config = await readAuditSettings(this.settings);
      const cutoff = this.sqliteDate(this.cutoff(config.retention_days));
      while (!this.stopping) {
        const hasOverflow = await this.hasPasswordPolicyOverflow();
        const count = await this.serializeStorageWrite(async () => {
          if (this.stopping) return 0;
          return storage.transaction(async (manager) => {
            const rows = await manager.query<{ id: number }[]>(
              'SELECT id FROM audit_log WHERE at < ? ORDER BY at, id LIMIT 1000',
              [cutoff],
            );
            if (rows.length === 0) return 0;
            const ids = rows.map(({ id }) => id);
            const placeholders = ids.map(() => '?').join(', ');
            if (hasOverflow) {
              await manager.query(
                `DELETE FROM password_policy_audit_overflow
                WHERE legacyAuditId IN (
                  SELECT json_extract(details, '$.legacyAuditId') FROM audit_log WHERE id IN (${placeholders})
                )`,
                ids,
              );
            }
            await manager.query(`DELETE FROM audit_log WHERE id IN (${placeholders})`, ids);
            return rows.length;
          });
        });
        if (count > 0) this.logger.log(`Deleted ${count} expired audit rows`);
        if (count < 1000) break;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    } catch {
      // Retention must not affect domain operations or expose database errors.
    } finally {
      this.cleaning = false;
    }
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

  private async hasPasswordPolicyOverflow(): Promise<boolean> {
    const storage = this.storage;
    if (!storage) return false;
    const rows = await storage.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'password_policy_audit_overflow' LIMIT 1",
    );
    return rows.some((row: { name?: unknown }) => row.name === 'password_policy_audit_overflow');
  }

  /** Hydrate only legacy rows returned on this page; current audit event details stay bounded at write time. */
  private async hydrateLegacyPasswordPolicyDetails(items: AuditLog[]): Promise<void> {
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
}
