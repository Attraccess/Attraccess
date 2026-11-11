import { AuditLog } from '@attraccess/database-entities';

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { SettingsStoreService } from '../settings/settings-store.service';

import {
  AUDIT_SHUTDOWN_DRAIN_MS,
  auditCutoff,
  AuditStorage,
  hasPasswordPolicyOverflow,
  SQLITE_BUSY_TIMEOUT_MS,
  sqliteErrorCode,
} from './persistence/audit-storage';

import { getRegisteredPluginAuditDomains } from '../plugin-system/audit/audit-registry';

import { AUDIT_DROP_REASONS, AuditMetrics } from '../metrics/definitions/audit.metrics';

import { AUDIT_METRICS } from '../metrics/definitions/tokens';

import { Interval } from '@nestjs/schedule';

import { readAuditSettings } from './audit.config';

import { AuditRecorder } from './recorder/audit-event';

/** The audit storage engine and the implementation of the AuditRecorder port (bound as AUDIT_RECORDER). */
@Injectable()
export class AuditService extends AuditStorage implements AuditRecorder, OnModuleInit, OnModuleDestroy {
  constructor(
    protected readonly source: DataSource,
    protected readonly settings: SettingsStoreService,
    @Inject(AUDIT_METRICS) protected readonly metrics: AuditMetrics,
  ) {
    super();
  }

  protected readonly logger = new Logger(AuditService.name);

  protected stopping = false;

  /** Set when the shutdown drain timed out: queued writes are then dropped as `shutting_down`. */
  protected drainExpired = false;

  protected shutdownDrainMs = AUDIT_SHUTDOWN_DRAIN_MS;

  protected activeReads = 0;

  protected storage?: DataSource;

  protected pending = 0;

  protected cleaning = false;

  protected writeTail: Promise<void> = Promise.resolve();

  async onModuleInit(): Promise<void> {
    // Plugin domains are registered while modules are built, before this runs. Zero series let the alert see a first drop.
    for (const { domain } of getRegisteredPluginAuditDomains())
      for (const reason of AUDIT_DROP_REASONS) this.metrics.recordsDropped.inc({ domain, reason }, 0);
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
    this.stopping = true;
    const drainDeadline = Date.now() + this.shutdownDrainMs;
    while (this.pending || this.cleaning || this.activeReads) {
      if (!this.drainExpired && Date.now() >= drainDeadline) this.drainExpired = true;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const storage = this.storage;
    this.storage = undefined;
    if (storage?.isInitialized) await storage.destroy().catch(() => undefined);
  }

  @Interval(60 * 60 * 1000)
  async cleanup(): Promise<void> {
    const storage = this.storage;
    if (this.stopping || !storage?.isInitialized || this.cleaning) return;
    this.cleaning = true;
    try {
      const config = await readAuditSettings(this.settings);
      const cutoff = this.sqliteDate(auditCutoff(config.retention_days));
      while (!this.stopping) {
        const hasOverflow = await hasPasswordPolicyOverflow(storage);
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
