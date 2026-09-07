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
import { projectAuditEvent } from './audit-policy';
import { AuditQueryDto } from './audit-query.dto';

const billingStatuses = new Set(['pending', 'completed', 'failed']);
const billingSources = new Set(['manual', 'resource-usage', 'refund', 'sumup-topup']);
const SQLITE_BUSY_TIMEOUT_MS = 100;
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
    Array<{ event: BillingTransactionAuditEvent; resolve: (receipt: PluginAuditReceipt) => void }>
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

  /** Defers billing audit writes until the supplied transaction has committed. */
  recordBillingTransactionAfterCommit(
    event: BillingTransactionAuditEvent,
    transactionManager?: EntityManager,
  ): Promise<PluginAuditReceipt> {
    const queryRunner = transactionManager?.queryRunner;
    if (!queryRunner?.isTransactionActive) return this.recordBillingTransaction(event);
    return new Promise((resolve) => {
      const events = this.billingEvents.get(queryRunner) ?? [];
      events.push({ event, resolve });
      this.billingEvents.set(queryRunner, events);
    });
  }

  afterTransactionCommit({ queryRunner }: TransactionCommitEvent): void {
    // Nested transaction commits release a savepoint; wait for the owning transaction.
    if (queryRunner.isTransactionActive) return;
    const events = this.billingEvents.get(queryRunner);
    if (!events) return;
    this.billingEvents.delete(queryRunner);
    for (const { event, resolve } of events) void this.recordBillingTransaction(event).then(resolve);
  }

  afterTransactionRollback({ queryRunner }: TransactionRollbackEvent): void {
    const events = this.billingEvents.get(queryRunner);
    if (!events) return;
    this.billingEvents.delete(queryRunner);
    for (const { resolve } of events) resolve({ status: 'unavailable' });
  }

  private async recordSnapshot(event: Omit<AuditLog, 'id' | 'at'>): Promise<PluginAuditReceipt> {
    if (this.stopping || !this.storage?.isInitialized || this.pending >= 8) return { status: 'unavailable' };
    if (this.source.createQueryRunner().isTransactionActive) return { status: 'unavailable' };
    this.pending++;
    try {
      const config = await readAuditSettings(this.settings);
      if (!config.enabled || !config.domains.includes(event.domain as 'billing' | 'wago') || this.stopping)
        return { status: 'unavailable' };
      // sqlite3 queues concurrent statements after a busy timeout. Keep those writes in our
      // bounded admission queue instead, so a released lock cannot revive stale audit writes.
      const precedingWrite = this.writeTail;
      let releaseWrite: () => void;
      this.writeTail = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      try {
        await precedingWrite;
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
      } finally {
        releaseWrite();
      }
      return { status: 'recorded' };
    } finally {
      this.pending--;
    }
  }

  private cutoff(retentionDays: number): Date {
    return new Date(Date.now() - retentionDays * 86_400_000);
  }

  @Interval(60 * 60 * 1000)
  async cleanup(): Promise<void> {
    if (this.stopping || !this.storage?.isInitialized || this.cleaning) return;
    this.cleaning = true;
    try {
      const config = await readAuditSettings(this.settings);
      const cutoff = this.cutoff(config.retention_days);
      while (!this.stopping) {
        const result = await this.storage
          .getRepository(AuditLog)
          .createQueryBuilder()
          .delete()
          .where('id IN (SELECT id FROM audit_log WHERE at < :cutoff ORDER BY at LIMIT 1000)', { cutoff })
          .execute();
        const count = result.affected ?? 0;
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
      const items = rows.slice(0, limit);
      return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
    } finally {
      this.activeReads--;
    }
  }
}
