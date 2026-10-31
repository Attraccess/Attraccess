import { AuditService } from '../../audit/audit.service';
import { Actor } from './pairing-model';

export type PairingAuditAction =
  | 'reader.enrolled'
  | 'reader.pairing_confirmed'
  | 'reader.pairing_failed'
  | 'reader.pairing_expired'
  | 'reader.revoked'
  | 'reader.replaced';

/**
 * The audit log needs a reader and a responsible person; reader-initiated events use the device
 * actor. Events without a reader are skipped. Best effort: auditing never fails a pairing.
 */
export async function recordPairingEvent(
  audit: AuditService,
  readerId: number | null,
  action: PairingAuditAction,
  actor: Actor | null,
  details: Record<string, string | number>,
): Promise<void> {
  if (!readerId) return;
  await audit
    .recordAttractap({
      action,
      actorId: actor ? actor.userId : null,
      authenticationMethod: actor ? actor.authenticationMethod : null,
      apiTokenId: actor?.authenticationMethod === 'api-token' ? actor.apiTokenId : undefined,
      subjectId: readerId,
      details,
    })
    .catch(() => undefined);
}
