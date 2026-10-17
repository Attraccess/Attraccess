import { AuditPersistence, AuditTransactionObserver, AuditCommitBoundary } from './persistence/port';
import { PluginAuditHostProvider, PluginAuditReceipt } from '@attraccess/plugins-backend-sdk/v2';

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { randomUUID } from 'crypto';

import { SettingsStoreService } from '../settings/settings-store.service';

import {
  AttractapAuditEvent,
  IdentityAuditEvent,
  projectAttractapAuditEvent,
  projectIdentityAuditEvent,
  projectSsoAuditEvent,
  SsoAuditEvent,
} from './audit-policy';

import { BillingTransactionAuditEvent } from './persistence/audit-storage';

import { Interval } from '@nestjs/schedule';

import { readAuditSettings } from './audit.config';

import { AuditStorage } from './persistence/audit-storage';

export { BillingTransactionAuditEvent } from './persistence/audit-storage';

@Injectable()
export class AuditService extends AuditStorage implements PluginAuditHostProvider, OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(AuditPersistence) protected readonly persistence: AuditPersistence,
    protected readonly settings: SettingsStoreService,
    @Inject(AuditTransactionObserver) protected readonly observer: AuditTransactionObserver,
  ) {
    super();
  }

  protected readonly logger = new Logger(AuditService.name);

  protected stopping = false;

  protected activeReads = 0;

  protected pending = 0;

  protected cleaning = false;

  protected writeTail: Promise<void> = Promise.resolve();

  protected contended = false;

  async onModuleInit(): Promise<void> {
    if (this.persistence.available() || this.stopping) return;
    this.observer.start();
    await this.persistence.open();
    if (this.persistence.available()) await this.cleanup();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    this.observer.stop();
    while (this.pending || this.cleaning || this.activeReads) await new Promise((resolve) => setTimeout(resolve, 5));
    await this.persistence.close();
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
    if (this.stopping || !this.persistence.available() || this.cleaning) return;
    this.cleaning = true;
    try {
      const config = await readAuditSettings(this.settings);
      const cutoff = this.cutoff(config.retention_days);
      while (!this.stopping) {
        const hasOverflow = await this.persistence.hasLegacyMetadata();
        const count = await this.serializeStorageWrite(async () => {
          if (this.stopping) return 0;
          return this.persistence.removeExpired(cutoff, hasOverflow);
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
    boundary?: AuditCommitBoundary,
  ): Promise<PluginAuditReceipt> {
    const write = () => this.recordBillingTransaction(event);
    return boundary ? boundary.defer(write) : write();
  }
}
