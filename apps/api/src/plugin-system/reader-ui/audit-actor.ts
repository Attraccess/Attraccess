import type { AuditActor as RecordedAuditActor } from '../../audit/recorder/audit-event';
import type { AuthenticationMethod } from '@attraccess/database-entities';

/** The admin behind a reader UI change, as the audit records it (session, API token or MCP OAuth). */
export interface AuditActor {
  id: number;
  authenticationMethod?: AuthenticationMethod;
  apiTokenId?: number;
}

export function auditActorFields(actor: AuditActor): RecordedAuditActor {
  const viaToken = actor.authenticationMethod === 'api-token' && actor.apiTokenId !== undefined;
  const viaMcp = actor.authenticationMethod === 'mcp-oauth';
  return {
    id: actor.id,
    authenticationMethod: viaToken ? 'api-token' : viaMcp ? 'mcp-oauth' : 'session',
    ...(viaToken ? { apiTokenId: actor.apiTokenId } : {}),
  };
}
