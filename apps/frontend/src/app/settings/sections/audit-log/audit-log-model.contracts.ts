import { AuditSettingsDto } from '@attraccess/react-query-client';

export type AuditDomain = AuditSettingsDto['domains'][number];

export type AuditFilters = {
  domain: string;
  eventPrefix: string;
  actorId: string;
  subjectId: string;
  subjectType: string;
  outcome: string;
  from: string;
  to: string;
};
