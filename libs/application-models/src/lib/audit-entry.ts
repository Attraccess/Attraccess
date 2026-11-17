export type AuditOutcome = 'attempted' | 'succeeded' | 'failed';

/** How a principal authenticated. Extend this list (not a copy of it) when a new method is added. */
export const AUTHENTICATION_METHODS = ['session', 'api-token', 'mcp-oauth'] as const;
export type AuthenticationMethod = (typeof AUTHENTICATION_METHODS)[number];

export type AuditAuthenticationMethod = AuthenticationMethod;

type AuditEntryDetails = Record<string, string | number | boolean | null>;

/** One audit record before storage: everything but the identity and timestamp the store assigns. */
export interface AuditEntryDraft {
  domain: string;
  pluginId: string | null;
  action: string;
  operationId: string;
  actorId: number | null;
  authenticationMethod: AuditAuthenticationMethod | null;
  apiTokenId: number | null;
  outcome: AuditOutcome;
  subjectType: string;
  subjectId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  details: AuditEntryDetails;
}

/** A stored audit record. */
export interface AuditEntry extends AuditEntryDraft {
  id: number;
  at: Date;
}

/** Filters of the audit listing. `notBefore` is the retention cutoff; every filter narrows the result. */
export interface AuditEntryFilter {
  notBefore: Date;
  domain?: string;
  action?: string;
  outcome?: AuditOutcome;
  operationId?: string;
  actorId?: number;
  subjectId?: number;
  subjectType?: string;
  /** Entries whose action starts with this prefix. */
  eventPrefix?: string;
  from?: Date;
  to?: Date;
  /** Cursor: only entries with a smaller id. */
  beforeId?: number;
}

/** Kinds of subjects whose current display name the audit listing can look up. */
export type AuditSubjectNameKind = 'user' | 'resource' | 'resource-group' | 'project';
