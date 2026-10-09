import { AuditLog } from '@attraccess/database-entities';

import { PluginAuditHostProvider, PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { randomUUID } from 'crypto';

import {
  DataSource,
  EntitySubscriberInterface,
  QueryRunner,
  EntityManager,
  TransactionCommitEvent,
  TransactionRollbackEvent,
} from 'typeorm';

import { SettingsStoreService } from '../settings/settings-store.service';

import {
  AttractapAuditEvent,
  IdentityAuditEvent,
  projectAttractapAuditEvent,
  projectIdentityAuditEvent,
  projectSsoAuditEvent,
  SsoAuditEvent,
} from './audit-policy';

import { BillingTransactionAuditEvent, SQLITE_BUSY_TIMEOUT_MS } from './persistence/audit-storage';

import { Interval } from '@nestjs/schedule';

import { readAuditSettings } from './audit.config';

import { AuditStorage } from './persistence/audit-storage';

export { BillingTransactionAuditEvent } from './persistence/audit-storage';

@Injectable()
export class AuditService
  extends AuditStorage
  implements PluginAuditHostProvider, EntitySubscriberInterface, OnModuleInit, OnModuleDestroy
{
  constructor(
    protected readonly source: DataSource,
    protected readonly settings: SettingsStoreService,
  ) {
    super();
  }

  protected readonly logger = new Logger(AuditService.name);

  protected stopping = false;

  protected activeReads = 0;

  protected storage?: DataSource;

  protected pending = 0;

  protected cleaning = false;

  protected writeTail: Promise<void> = Promise.resolve();

  protected contended = false;

  protected subscribed = false;

  protected readonly billingEvents = new WeakMap<
    QueryRunner,
    Array<{
      event: BillingTransactionAuditEvent;
      transactionDepth: number;
      resolve: (receipt: PluginAuditReceipt) => void;
    }>
  >();

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

  async recordSso(event: SsoAuditEvent): Promise<PluginAuditReceipt> {
    try {
      const snapshot = projectSsoAuditEvent(event);
      if (!snapshot) return { status: 'unavailable' };
      return await this.recordSnapshot({
        domain: 'sso',
        pluginId: null,
        action: snapshot.action,
        operationId: snapshot.operationId,
        actorId: snapshot.actorId,
        authenticationMethod: snapshot.authenticationMethod,
        apiTokenId: snapshot.apiTokenId ?? null,
        outcome: 'succeeded',
        subjectType: snapshot.subject.type,
        subjectId: snapshot.subject.id,
        ipAddress: null,
        userAgent: null,
        details: snapshot.details,
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

  async recordAttractap(event: AttractapAuditEvent): Promise<void> {
    try {
      const snapshot = projectAttractapAuditEvent(event);
      if (!snapshot) return;
      await this.recordSnapshot({
        domain: 'attractap',
        pluginId: 'core',
        action: `attractap.${snapshot.action}`,
        operationId: randomUUID(),
        actorId: snapshot.actorId,
        authenticationMethod: snapshot.authenticationMethod,
        apiTokenId: snapshot.apiTokenId ?? null,
        outcome: 'succeeded',
        subjectType: snapshot.action.startsWith('card.') ? 'attractap.card' : 'attractap.reader',
        subjectId: snapshot.subjectId,
        ipAddress: null,
        userAgent: null,
        details: snapshot.details,
      });
    } catch {
      /* Audit persistence must not affect Attractap operations. */
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

  protected transactionDepth(queryRunner: QueryRunner): number {
    return (queryRunner as QueryRunner & { transactionDepth: number }).transactionDepth;
  }
}
