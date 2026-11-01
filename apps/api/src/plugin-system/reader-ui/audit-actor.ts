/** The admin behind a reader UI change, as the audit records it (session or API token). */
export interface AuditActor {
  id: number;
  authenticationMethod?: 'session' | 'api-token';
  apiTokenId?: number;
}

export function auditActorFields(actor: AuditActor) {
  const viaToken = actor.authenticationMethod === 'api-token' && actor.apiTokenId !== undefined;
  return {
    actorId: actor.id,
    authenticationMethod: viaToken ? ('api-token' as const) : ('session' as const),
    ...(viaToken ? { apiTokenId: actor.apiTokenId } : {}),
  };
}
