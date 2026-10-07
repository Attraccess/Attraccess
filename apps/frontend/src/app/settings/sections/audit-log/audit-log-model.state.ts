import { $AuditSettingsDto } from '@attraccess/react-query-client';
import type { AuditFilters } from './audit-log-model.contracts';
import { $AuditQueryDto } from '@attraccess/react-query-client';

/** Audit domains owned by the core app. Plugin domains arrive through the audit meta endpoint. */
export const coreAuditDomains = $AuditSettingsDto.properties.domains.items.enum;

export const eventPrefix = new RegExp($AuditQueryDto.properties.eventPrefix.pattern);

export const emptyFilters: AuditFilters = {
  domain: '',
  eventPrefix: '',
  actorId: '',
  subjectId: '',
  subjectType: '',
  outcome: '',
  from: '',
  to: '',
};

export const subjectTypePattern = new RegExp($AuditQueryDto.properties.subjectType.pattern);
