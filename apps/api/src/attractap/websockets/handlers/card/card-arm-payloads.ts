import type { AuthenticatedWebSocket } from '../../websocket.types';

/** What the instance holding a reader's connection needs to arm an enrollment or reset on it. */
type AuditPrincipal = NonNullable<AuthenticatedWebSocket['state']['enrollment']>['auditPrincipal'];

export interface EnrollPayload {
  readerId: number;
  userId: number;
  auditPrincipal: AuditPrincipal;
  username: string;
  displayName: string;
  screenClaim?: string;
}

export interface ResetPayload {
  readerId: number;
  cardId: number;
  auditPrincipal: AuditPrincipal;
  username: string;
  displayName: string;
  screenClaim?: string;
}
