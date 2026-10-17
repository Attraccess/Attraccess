/** Historical identifiers deliberately have no foreign keys or cascade relations. */
export interface AuditLog {
  id: number;
  at: Date;
  domain: string;
  pluginId: string | null;
  action: string;
  operationId: string;
  actorId: number | null;
  authenticationMethod: 'session' | 'api-token' | null;
  apiTokenId: number | null;
  outcome: 'attempted' | 'succeeded' | 'failed';
  subjectType: string;
  subjectId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  details: Record<string, string | number | boolean | null>;
}
