import type { AuditActor as RecordedAuditActor } from '../../audit/recorder/audit-event';

/** The admin behind a reader UI change, as the audit records it (session or API token). */
export interface AuditActor {
  id: number;
  authenticationMethod?: 'session' | 'api-token';
  apiTokenId?: number;
}

export function auditActorFields(actor: AuditActor): RecordedAuditActor {
  const viaToken = actor.authenticationMethod === 'api-token' && actor.apiTokenId !== undefined;
  return {
    id: actor.id,
    authenticationMethod: viaToken ? 'api-token' : 'session',
    ...(viaToken ? { apiTokenId: actor.apiTokenId } : {}),
  };
}
