import type { AuditOutcome } from '@attraccess/application-models';
import { Injectable } from '@nestjs/common';
import { getRegisteredPluginAuditDomains } from '../plugin-system/audit/audit-registry';
import { SettingsStoreService } from '../settings/settings-store.service';
import { readAuditSettings } from './audit.config';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditMetaDto, AuditPageDto } from './dto/audit-response.dto';
import { auditCutoff } from './persistence/audit-storage';
import { CORE_AUDIT_DOMAINS } from './policies/domains';
import { auditEntriesWithLabels } from './policies/labels';
import { knownAuditActions, knownSubjectTypes } from './policies/vocabulary';

/** Read side of the audit log. Writes go through the AuditRecorder port. */
@Injectable()
export class AuditQueryService {
  constructor(
    private readonly audit: AuditService,
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
    return this.audit.read(async (reader) => {
      const config = await readAuditSettings(this.settings);
      const limit = Math.min(100, Math.max(1, query.limit ?? 50));
      const { entries, hasMore } = await reader.findEntries(
        {
          notBefore: auditCutoff(config.retention_days),
          domain: query.domain,
          action: query.action,
          outcome: query.outcome as AuditOutcome | undefined,
          operationId: query.operationId,
          actorId: query.actorId,
          subjectId: query.subjectId,
          subjectType: query.subjectType,
          eventPrefix: query.eventPrefix,
          from: query.from === undefined ? undefined : new Date(query.from),
          to: query.to === undefined ? undefined : new Date(query.to),
          beforeId: query.beforeId,
        },
        limit,
      );
      const items = await auditEntriesWithLabels(reader, entries);
      return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
    });
  }
}
