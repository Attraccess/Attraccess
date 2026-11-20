import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';

import { SettingsStoreService } from '../settings/settings-store.service';

import { AUDIT_SHUTDOWN_DRAIN_MS, auditCutoff, AuditStorage, AuditStorageState } from './persistence/audit-storage';

import { AUDIT_STORE, AuditEntryReader, AuditStore } from './audit-persistence.port';

import { getRegisteredPluginAuditDomains } from '../plugin-system/audit/audit-registry';

import { AUDIT_DROP_REASONS, AuditMetrics } from '../metrics/definitions/audit.metrics';

import { AUDIT_METRICS } from '../metrics/definitions/tokens';

import { Interval } from '@nestjs/schedule';

import { readAuditSettings } from './audit.config';

import { AuditEvent, AuditRecorder, AuditRecordOptions, AuditTransactionRef } from './recorder/audit-event';

/** The audit storage engine and the implementation of the AuditRecorder port (bound as AUDIT_RECORDER). */
@Injectable()
export class AuditService implements AuditRecorder, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);

  private readonly state = new AuditStorageState();

  private readonly storage: AuditStorage;

  private shutdownDrainMs = AUDIT_SHUTDOWN_DRAIN_MS;

  constructor(
    @Inject(AUDIT_STORE) private readonly store: AuditStore,
    private readonly settings: SettingsStoreService,
    @Inject(AUDIT_METRICS) private readonly metrics: AuditMetrics,
  ) {
    this.storage = new AuditStorage(store, settings, metrics, this.logger, this.state);
  }

  async onModuleInit(): Promise<void> {
    // Plugin domains are registered while modules are built, before this runs. Zero series let the alert see a first drop.
    for (const { domain } of getRegisteredPluginAuditDomains())
      for (const reason of AUDIT_DROP_REASONS) this.metrics.recordsDropped.inc({ domain, reason }, 0);
    if (this.store.isOpen || this.state.stopping) return;
    const opened = await this.store.open();
    if (opened.status === 'unsupported') {
      this.logger.warn('Audit storage unavailable: requires a PostgreSQL database');
      return;
    }
    if (opened.status === 'failed') {
      // Only the driver code or error name: the driver message may contain the database path.
      this.logger.error(`Audit storage initialization failed: ${opened.code ?? opened.errorName ?? 'unknown error'}`);
      return;
    }
    await this.cleanup();
  }

  async onModuleDestroy(): Promise<void> {
    // New writes are refused from here on; writes already queued are stored, within a time limit.
    this.state.stopping = true;
    const drainDeadline = Date.now() + this.shutdownDrainMs;
    while (this.state.pending || this.state.cleaning || this.state.activeReads) {
      if (!this.state.drainExpired && Date.now() >= drainDeadline) this.state.drainExpired = true;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await this.store.close();
  }

  @Interval(60 * 60 * 1000)
  async cleanup(): Promise<void> {
    if (this.state.stopping || !this.store.isOpen || this.state.cleaning) return;
    this.state.cleaning = true;
    try {
      const config = await readAuditSettings(this.settings);
      const cutoff = auditCutoff(config.retention_days);
      while (!this.state.stopping) {
        const count = await this.store.deleteExpired(cutoff, 1000, () => this.state.stopping);
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
  async record(
    event: AuditEvent,
    transaction?: AuditTransactionRef,
    options?: AuditRecordOptions,
  ): Promise<PluginAuditReceipt> {
    return this.storage.record(event, transaction, options);
  }

  /** Runs a read on the audit connection; shutdown waits for it. */
  async read<T>(query: (reader: AuditEntryReader) => Promise<T>): Promise<T> {
    return this.storage.read(query);
  }
}
