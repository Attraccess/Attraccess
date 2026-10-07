import { AuditLog } from '@attraccess/database-entities';
import { ServiceUnavailableException } from '@nestjs/common';
import { getRegisteredPluginAuditDomains } from '../plugin-system/plugin-audit-registry';
import { AuditCaptureStorageImplementation } from './audit-capture-storage';
import { CORE_AUDIT_DOMAINS } from './audit-domains';
import { auditEntriesWithLabels } from './audit-labels';
import { AuditQueryDto } from './audit-query.dto';
import { AuditMetaDto } from './audit-response.dto';
import { knownAuditActions, knownSubjectTypes } from './audit-vocabulary';
import { readAuditSettings } from './audit.config';
export abstract class AuditQueryStorageImplementation extends AuditCaptureStorageImplementation {
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
}
