import { Role } from '@attraccess/database-entities';
import { identityAuditEvent } from '../../audit/policies/identity';
import type { AuditEvent, AuditOrigin } from '../../audit/recorder/audit-event';

/** The identity event for a custom role's lifecycle; it names the role by its key. */
export function roleAuditEvent(
  action: 'role_created' | 'role_updated' | 'role_deleted',
  role: Role,
  origin: AuditOrigin,
): AuditEvent<'identity'> {
  return identityAuditEvent(action, origin, { type: 'identity.role', id: role.id }, { role: role.key });
}
