import { AuditLog } from '@attraccess/database-entities';
import { PluginAuditHostProvider, PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntitySubscriberInterface, QueryRunner } from 'typeorm';
import { SettingsStoreService } from '../settings/settings-store.service';
import {
  AttractapAuditEvent,
  IdentityAuditEvent,
  projectAttractapAuditEvent,
  projectIdentityAuditEvent,
  projectSsoAuditEvent,
  SsoAuditEvent,
} from './audit-policy';
import { AuditRetentionImplementation } from './audit-retention';
import { BillingTransactionAuditEvent, SQLITE_BUSY_TIMEOUT_MS } from './audit.service.route-context';

@Injectable()
export class AuditService
  extends AuditRetentionImplementation
  implements PluginAuditHostProvider, EntitySubscriberInterface, OnModuleInit, OnModuleDestroy
{
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

  constructor(
    protected readonly source: DataSource,
    protected readonly settings: SettingsStoreService,
  ) {
    super();
  }

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
}

export { BillingTransactionAuditEvent } from './audit.service.route-context';
