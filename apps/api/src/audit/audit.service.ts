import { AuditLog } from '@attraccess/database-entities';

import { PluginAuditHostProvider, PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { randomUUID } from 'crypto';

import { DataSource, EntityManager } from 'typeorm';

import { SettingsStoreService } from '../settings/settings-store.service';

import {
  AttractapAuditEvent,
  IdentityAuditEvent,
  projectAttractapAuditEvent,
  projectIdentityAuditEvent,
  projectSsoAuditEvent,
  SsoAuditEvent,
} from './audit-policy';

import { SQLITE_BUSY_TIMEOUT_MS } from './persistence/audit-storage';

import { AuditMetrics } from '../metrics/definitions/audit.metrics';

import { AUDIT_METRICS } from '../metrics/definitions/tokens';

import { Interval } from '@nestjs/schedule';

import { readAuditSettings } from './audit.config';

import { AuditStorage } from './persistence/audit-storage';

export { BillingTransactionAuditEvent } from './persistence/audit-storage';

@Injectable()
export class AuditService extends AuditStorage implements PluginAuditHostProvider, OnModuleInit, OnModuleDestroy {
  constructor(
    protected readonly source: DataSource,
    protected readonly settings: SettingsStoreService,
    @Inject(AUDIT_METRICS) protected readonly metrics: AuditMetrics,
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

  async onModuleInit(): Promise<void> {
    if (this.storage?.isInitialized || this.stopping) return;
    // A separate connection guarantees that a write without a caller transaction follows autocommit,
    // never a savepoint in another request's shared SQLite transaction. No schema sync.
    if (this.source.options.type !== 'sqlite' || this.source.options.database === ':memory:') {
      this.logger.warn('Audit storage unavailable: requires a file-backed SQLite database');
      return;
    }
    const storage = new DataSource({
      type: 'sqlite',
      database: this.source.options.database,
      entities: [AuditLog],
      synchronize: false,
      migrationsRun: false,
      logging: false,
      busyTimeout: SQLITE_BUSY_TIMEOUT_MS,
    });
    try {
      await storage.initialize();
      await storage.query(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
      await storage.query('PRAGMA synchronous = FULL');
      this.storage = storage;
      await this.cleanup();
    } catch (error) {
      // Only the error name: the driver message may contain the database path.
      this.logger.error(
        `Audit storage initialization failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
      if (storage.isInitialized) await storage.destroy().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    while (this.pending || this.cleaning || this.activeReads) await new Promise((resolve) => setTimeout(resolve, 5));
    const storage = this.storage;
    this.storage = undefined;
    if (storage?.isInitialized) await storage.destroy().catch(() => undefined);
  }

  async recordSso(event: SsoAuditEvent, transaction?: EntityManager): Promise<PluginAuditReceipt> {
    const snapshot = this.project(() => projectSsoAuditEvent(event));
    if (!snapshot) return this.drop(undefined, 'invalid_event');
    return this.recordSnapshot(
      {
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
      },
      { transaction },
    );
  }

  async recordIdentity(event: IdentityAuditEvent, transaction?: EntityManager): Promise<PluginAuditReceipt> {
    const snapshot = this.project(() => projectIdentityAuditEvent(event));
    if (!snapshot) return this.drop(undefined, 'invalid_event');
    return this.recordSnapshot(
      {
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
      },
      { transaction },
    );
  }

  async recordAttractap(event: AttractapAuditEvent, transaction?: EntityManager): Promise<void> {
    const snapshot = this.project(() => projectAttractapAuditEvent(event));
    if (!snapshot) {
      this.drop(undefined, 'invalid_event');
      return;
    }
    await this.recordSnapshot(
      {
        domain: 'attractap',
        pluginId: 'core',
        action: `attractap.${snapshot.action}`,
        operationId: randomUUID(),
        actorId: snapshot.actorId,
        authenticationMethod: snapshot.authenticationMethod,
        apiTokenId: snapshot.apiTokenId ?? null,
        outcome: 'succeeded',
        subjectType: snapshot.action.startsWith('card.')
          ? 'attractap.card'
          : (snapshot.subjectType ?? 'attractap.reader'),
        subjectId: snapshot.subjectId,
        ipAddress: null,
        userAgent: null,
        details: snapshot.details,
      },
      { transaction },
    );
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
}
