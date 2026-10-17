import { AuditLog } from '@attraccess/database-entities';

import { ServiceUnavailableException, Logger } from '@nestjs/common';

import { getRegisteredPluginAuditDomains, getPluginAuditDomain } from '../../plugin-system/audit/audit-registry';

import { CORE_AUDIT_DOMAINS } from '../policies/domains';

import { auditEntriesWithLabels } from '../policies/labels';

import { AuditQueryDto } from '../dto/audit-query.dto';

import { AuditMetaDto } from '../dto/audit-response.dto';

import { knownAuditActions, knownSubjectTypes } from '../policies/vocabulary';

import { readAuditSettings, AuditSettings } from '../audit.config';

import { PluginAuditEvent, PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';

import { projectPluginAuditEvent } from '../policies/plugins';

import { randomUUID } from 'crypto';

import {
  AdministrationAuditEvent,
  PreviousAuditSettings,
  projectAdministrationAuditEvent,
} from '../policies/administration';

import {
  ProjectAuditEvent,
  projectProjectAuditEvent,
  projectResourceAuditEvent,
  ResourceAuditEvent,
} from '../audit-policy';

import { DataSource, QueryRunner } from 'typeorm';

import { SettingsStoreService } from '../../settings/settings-store.service';

export const billingStatuses = new Set(['pending', 'completed', 'failed']);

export const billingSources = new Set(['manual', 'resource-usage', 'refund', 'sumup-topup', 'energy-correction']);

export const SQLITE_BUSY_TIMEOUT_MS = 10;

export const SQLITE_CONTENTION_RECOVERY_DELAY_MS = 500;

export interface BillingTransactionAuditEvent {
  transactionId: number;
  userId: number;
  initiatorId?: number | null;
  amount: number;
  status: string;
  previousStatus?: string;
  source: string;
}

export abstract class AuditStorage {
  /** Current audit filter vocabulary: core values plus contributions from loaded plugins. */
  meta(): AuditMetaDto {
    return {
      domains: [
        ...CORE_AUDIT_DOMAINS.map((id) => ({ id, source: 'core' as const })),
        ...getRegisteredPluginAuditDomains().map(({ domain, labels }) => ({
          id: domain,
          source: 'plugin' as const,
          labels: { ...labels },
        })),
      ],
      subjectTypes: knownSubjectTypes(),
      actions: knownAuditActions(),
    };
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

  protected async hasPasswordPolicyOverflow(): Promise<boolean> {
    const storage = this.storage;
    if (!storage) return false;
    const rows = await storage.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'password_policy_audit_overflow' LIMIT 1",
    );
    return rows.some((row: { name?: unknown }) => row.name === 'password_policy_audit_overflow');
  }

  /** Hydrate only legacy rows returned on this page; current audit event details stay bounded at write time. */
  protected async hydrateLegacyPasswordPolicyDetails(items: AuditLog[]): Promise<void> {
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

  /** Host bridge for plugin audit events: validated against the recording plugin's registered domain declaration. */
  async record(event: PluginAuditEvent & { pluginId: string }): Promise<PluginAuditReceipt> {
    try {
      const snapshot = projectPluginAuditEvent(event);
      if (!snapshot) return { status: 'unavailable' };
      return await this.recordSnapshot({
        domain: snapshot.domain,
        pluginId: snapshot.pluginId,
        action: snapshot.action,
        operationId: snapshot.operationId,
        actorId: snapshot.actorId,
        authenticationMethod: snapshot.authenticationMethod,
        apiTokenId: snapshot.apiTokenId ?? null,
        outcome: snapshot.outcome,
        subjectType: snapshot.subjectType,
        subjectId: snapshot.subjectId,
        ipAddress: null,
        userAgent: null,
        details: snapshot.details,
      });
    } catch {
      // Never log the event, SQLite parameters, or exception (may contain secrets).
      return { status: 'unavailable' };
    }
  }

  protected async recordSnapshot(
    event: Omit<AuditLog, 'id' | 'at'>,
    finalSettingsChange = false,
  ): Promise<PluginAuditReceipt> {
    if (this.stopping || !this.storage?.isInitialized || this.pending >= 8) return { status: 'unavailable' };
    if (this.source.createQueryRunner().isTransactionActive) return { status: 'unavailable' };
    this.pending++;
    try {
      const config = await readAuditSettings(this.settings);
      if ((!finalSettingsChange && (!config.enabled || !this.domainEnabled(config, event.domain))) || this.stopping)
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

  /** Serializes every write on the audit storage connection, including cleanup transactions. */
  protected async serializeStorageWrite<T>(write: () => Promise<T>): Promise<T> {
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

  /** Core domains follow the configured allowlist; plugin domains record while registered unless explicitly disabled. */
  protected domainEnabled(config: AuditSettings, domain: string): boolean {
    return getPluginAuditDomain(domain) !== undefined
      ? !config.plugin_domains_disabled.includes(domain)
      : (config.domains as readonly string[]).includes(domain);
  }

  protected cutoff(retentionDays: number): Date {
    return new Date(Date.now() - retentionDays * 86_400_000);
  }

  protected sqliteDate(date: Date): string {
    return date.toISOString().replace('T', ' ').replace('Z', '');
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

  async recordResource(event: Omit<ResourceAuditEvent, 'operationId'>): Promise<boolean> {
    try {
      const snapshot = projectResourceAuditEvent({ ...event, operationId: randomUUID() });
      const storage = this.storage;
      if (!snapshot || this.stopping || !storage?.isInitialized || this.pending >= 8) return false;
      this.pending++;
      try {
        const config = await readAuditSettings(this.settings);
        if (!config.enabled || !config.domains.includes('resource') || this.stopping) return false;
        await this.serializeStorageWrite(() =>
          storage.getRepository(AuditLog).insert({
            at: new Date(),
            domain: 'resource',
            pluginId: 'core',
            action: snapshot.action,
            operationId: snapshot.operationId,
            actorId: snapshot.actorId,
            authenticationMethod:
              snapshot.authenticationMethod === undefined
                ? snapshot.actorId === null
                  ? null
                  : 'session'
                : snapshot.authenticationMethod,
            apiTokenId: snapshot.apiTokenId ?? null,
            outcome: 'succeeded',
            subjectType: snapshot.subjectType ?? 'resource',
            subjectId: snapshot.subjectId,
            ipAddress: null,
            userAgent: null,
            details: snapshot.details,
          }),
        );
        return true;
      } finally {
        this.pending--;
      }
    } catch {
      /* Audit persistence must not affect resource operations. */
      return false;
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

  async recordProject(event: Omit<ProjectAuditEvent, 'operationId'>): Promise<void> {
    try {
      const snapshot = projectProjectAuditEvent({ ...event, operationId: randomUUID() });
      const storage = this.storage;
      if (!snapshot || this.stopping || !storage?.isInitialized || this.pending >= 8) return;
      this.pending++;
      try {
        const config = await readAuditSettings(this.settings);
        if (!config.enabled || !config.domains.includes('project') || this.stopping) return;
        await this.serializeStorageWrite(() =>
          storage.getRepository(AuditLog).insert({
            at: new Date(),
            domain: 'project',
            pluginId: 'core',
            action: snapshot.action,
            operationId: snapshot.operationId,
            actorId: snapshot.actorId,
            authenticationMethod: snapshot.authenticationMethod ?? 'session',
            apiTokenId: snapshot.apiTokenId ?? null,
            outcome: 'succeeded',
            subjectType: snapshot.subjectType,
            subjectId: snapshot.subjectId,
            ipAddress: null,
            userAgent: null,
            details: snapshot.details,
          }),
        );
      } finally {
        this.pending--;
      }
    } catch {
      /* Audit persistence must not affect project operations. */
    }
  }

  protected abstract readonly logger: Logger;

  protected abstract readonly billingEvents: WeakMap<
    QueryRunner,
    { event: BillingTransactionAuditEvent; transactionDepth: number; resolve: (receipt: PluginAuditReceipt) => void }[]
  >;

  protected abstract transactionDepth(queryRunner: QueryRunner): number;

  protected abstract storage?: DataSource;

  protected abstract stopping: boolean;

  protected abstract pending: number;

  protected abstract readonly settings: SettingsStoreService;

  protected abstract readonly source: DataSource;

  protected abstract contended: boolean;

  protected abstract writeTail: Promise<void>;

  protected abstract activeReads: number;

  protected abstract cleaning: boolean;
}
