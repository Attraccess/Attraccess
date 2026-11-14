import { AuditLog } from '@attraccess/database-entities';

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';

import { DataSource, EntityManager } from 'typeorm';

import { SettingsStoreService } from '../settings/settings-store.service';

import {
  AUDIT_SHUTDOWN_DRAIN_MS,
  auditCutoff,
  AuditStorage,
  AuditStorageState,
  hasPasswordPolicyOverflow,
  SQLITE_BUSY_TIMEOUT_MS,
  sqliteErrorCode,
} from './persistence/audit-storage';

import { getRegisteredPluginAuditDomains } from '../plugin-system/audit/audit-registry';

import { AUDIT_DROP_REASONS, AuditMetrics } from '../metrics/definitions/audit.metrics';

import { AUDIT_METRICS } from '../metrics/definitions/tokens';

import { Interval } from '@nestjs/schedule';

import { readAuditSettings } from './audit.config';

import { AuditEvent, AuditRecorder, AuditRecordOptions } from './recorder/audit-event';

/** The audit storage engine and the implementation of the AuditRecorder port (bound as AUDIT_RECORDER). */
@Injectable()
export class AuditService implements AuditRecorder, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);

  private readonly state = new AuditStorageState();

  private readonly store: AuditStorage;

  private shutdownDrainMs = AUDIT_SHUTDOWN_DRAIN_MS;

  constructor(
    private readonly source: DataSource,
    private readonly settings: SettingsStoreService,
    @Inject(AUDIT_METRICS) private readonly metrics: AuditMetrics,
  ) {
    this.store = new AuditStorage(settings, metrics, this.logger, this.state);
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

  @Interval(60 * 60 * 1000)
  async cleanup(): Promise<void> {
    const storage = this.storage;
    if (this.state.stopping || !storage?.isInitialized || this.state.cleaning) return;
    this.state.cleaning = true;
    try {
      const config = await readAuditSettings(this.settings);
      const cutoff = this.store.sqliteDate(auditCutoff(config.retention_days));
      while (!this.state.stopping) {
        const hasOverflow = await hasPasswordPolicyOverflow(storage);
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

  /** The AuditRecorder port; see AuditStorage.record. */
  async record(event: AuditEvent, manager?: EntityManager, options?: AuditRecordOptions): Promise<PluginAuditReceipt> {
    return this.store.record(event, manager, options);
  }

  /** Runs a read on the audit connection; shutdown waits for it. */
  async read<T>(query: (storage: DataSource) => Promise<T>): Promise<T> {
    return this.store.read(query);
  }
}
