import { AuditLog } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getRegisteredPluginAuditDomains } from '../plugin-system/audit/audit-registry';
import { SettingsStoreService } from '../settings/settings-store.service';
import { readAuditSettings } from './audit.config';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditMetaDto, AuditPageDto } from './dto/audit-response.dto';
import { auditCutoff, hasPasswordPolicyOverflow } from './persistence/audit-storage';
import { CORE_AUDIT_DOMAINS } from './policies/domains';
import { auditEntriesWithLabels } from './policies/labels';
import { knownAuditActions, knownSubjectTypes } from './policies/vocabulary';

/** Read side of the audit log. Writes go through the AuditRecorder port. */
@Injectable()
export class AuditQueryService {
  constructor(
    private readonly audit: AuditService,
    private readonly source: DataSource,
    private readonly settings: SettingsStoreService,
  ) {}

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

  list(query: AuditQueryDto): Promise<AuditPageDto> {
    return this.audit.read(async (storage) => {
      const config = await readAuditSettings(this.settings);
      const limit = Math.min(100, Math.max(1, query.limit ?? 50));
      const builder = storage
        .getRepository(AuditLog)
        .createQueryBuilder('audit')
        .where('audit.at >= :cutoff', { cutoff: auditCutoff(config.retention_days) });
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
      await hydrateLegacyPasswordPolicyDetails(storage, retainedRows);
      const items = await auditEntriesWithLabels(this.source, retainedRows);
      return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
    });
  }
}

/** Hydrate only legacy rows returned on this page; current audit event details stay bounded at write time. */
async function hydrateLegacyPasswordPolicyDetails(storage: DataSource, items: AuditLog[]): Promise<void> {
  const legacyIds = items
    .map((item) => {
      const legacyAuditId = Number(item.details.legacyAuditId);
      return Number.isSafeInteger(legacyAuditId) ? legacyAuditId : null;
    })
    .filter((id): id is number => id !== null);
  if (!legacyIds.length || !(await hasPasswordPolicyOverflow(storage))) return;
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
