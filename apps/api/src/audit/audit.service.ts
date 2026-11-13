import { AuditLog } from '@attraccess/database-entities';

import { PluginAuditEvent, PluginAuditHostProvider, PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { randomUUID } from 'crypto';

import { DataSource, EntityManager } from 'typeorm';

import { SettingsStoreService } from '../settings/settings-store.service';

import {
  AttractapAuditEvent,
  IdentityAuditEvent,
  projectAttractapAuditEvent,
  ProjectAuditEvent,
  projectIdentityAuditEvent,
  projectSsoAuditEvent,
  ResourceAuditEvent,
  SsoAuditEvent,
} from './audit-policy';

import { AUDIT_SHUTDOWN_DRAIN_MS, SQLITE_BUSY_TIMEOUT_MS, sqliteErrorCode } from './persistence/audit-storage';

import { getRegisteredPluginAuditDomains } from '../plugin-system/audit/audit-registry';

import { AUDIT_DROP_REASONS } from '../metrics/definitions/audit.metrics';

import { AuditMetrics } from '../metrics/definitions/audit.metrics';

import { AUDIT_METRICS } from '../metrics/definitions/tokens';

import { Interval } from '@nestjs/schedule';

import { readAuditSettings } from './audit.config';

import { AuditStorage, AuditStorageState } from './persistence/audit-storage';

export { BillingTransactionAuditEvent } from './persistence/audit-storage';

import { BillingTransactionAuditEvent } from './persistence/audit-storage';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditMetaDto } from './dto/audit-response.dto';
import { AdministrationAuditEvent, PreviousAuditSettings } from './policies/administration';

@Injectable()
export class AuditService implements PluginAuditHostProvider, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);

  private readonly state = new AuditStorageState();

  private readonly store: AuditStorage;

  private shutdownDrainMs = AUDIT_SHUTDOWN_DRAIN_MS;

  constructor(
    private readonly source: DataSource,
    private readonly settings: SettingsStoreService,
    @Inject(AUDIT_METRICS) private readonly metrics: AuditMetrics,
  ) {
    this.store = new AuditStorage(source, settings, metrics, this.logger, this.state);
  }

  /** The audit connection, once initialized. */
  private get storage(): DataSource | undefined {
    return this.state.storage;
  }

  async onModuleInit(): Promise<void> {
    // Plugin domains are registered while modules are built, before this runs. Zero series let the alert see a first drop.
    for (const { domain } of getRegisteredPluginAuditDomains())
      for (const reason of AUDIT_DROP_REASONS) this.metrics.recordsDropped.inc({ domain, reason }, 0);
    if (this.storage?.isInitialized || this.state.stopping) return;
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
      this.state.storage = storage;
      await this.cleanup();
    } catch (error) {
      // Only the SQLite code or error name: the driver message may contain the database path.
      this.logger.error(
        `Audit storage initialization failed: ${
          sqliteErrorCode(error) ?? (error instanceof Error ? error.name : 'unknown error')
        }`,
      );
      if (storage.isInitialized) await storage.destroy().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    // New writes are refused from here on; writes already queued are stored, within a time limit.
    this.state.stopping = true;
    const drainDeadline = Date.now() + this.shutdownDrainMs;
    while (this.state.pending || this.state.cleaning || this.state.activeReads) {
      if (!this.state.drainExpired && Date.now() >= drainDeadline) this.state.drainExpired = true;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const storage = this.storage;
    this.state.storage = undefined;
    if (storage?.isInitialized) await storage.destroy().catch(() => undefined);
  }

  async recordSso(event: SsoAuditEvent, transaction?: EntityManager): Promise<PluginAuditReceipt> {
    const snapshot = this.store.project(() => projectSsoAuditEvent(event));
    if (!snapshot) return this.store.drop('sso', 'invalid_event');
    return this.store.recordSnapshot(
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
    const snapshot = this.store.project(() => projectIdentityAuditEvent(event));
    if (!snapshot) return this.store.drop('identity', 'invalid_event');
    return this.store.recordSnapshot(
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
    const snapshot = this.store.project(() => projectAttractapAuditEvent(event));
    if (!snapshot) {
      this.store.drop('attractap', 'invalid_event');
      return;
    }
    await this.store.recordSnapshot(
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
    if (this.state.stopping || !storage?.isInitialized || this.state.cleaning) return;
    this.state.cleaning = true;
    try {
      const config = await readAuditSettings(this.settings);
      const cutoff = this.store.sqliteDate(this.store.cutoff(config.retention_days));
      while (!this.state.stopping) {
        const hasOverflow = await this.store.hasPasswordPolicyOverflow();
        const count = await this.store.serializeStorageWrite(async () => {
          if (this.state.stopping) return 0;
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
      this.state.cleaning = false;
    }
  }

  /** Current audit filter vocabulary: core values plus contributions from loaded plugins. */
  meta(): AuditMetaDto {
    return this.store.meta();
  }

  async list(query: AuditQueryDto): ReturnType<AuditStorage['list']> {
    return this.store.list(query);
  }

  async record(
    event: PluginAuditEvent & { pluginId: string },
    transaction?: EntityManager,
  ): Promise<PluginAuditReceipt> {
    return this.store.record(event, transaction);
  }

  async recordBillingTransaction(
    event: BillingTransactionAuditEvent,
    transaction?: EntityManager,
  ): Promise<PluginAuditReceipt> {
    return this.store.recordBillingTransaction(event, transaction);
  }

  async recordResource(event: Omit<ResourceAuditEvent, 'operationId'>, transaction?: EntityManager): Promise<boolean> {
    return this.store.recordResource(event, transaction);
  }

  async recordAdministration(
    event: AdministrationAuditEvent,
    previousAuditSettings?: PreviousAuditSettings,
    transaction?: EntityManager,
  ): Promise<PluginAuditReceipt> {
    return this.store.recordAdministration(event, previousAuditSettings, transaction);
  }

  async recordProject(event: Omit<ProjectAuditEvent, 'operationId'>, transaction?: EntityManager): Promise<void> {
    return this.store.recordProject(event, transaction);
  }
}
