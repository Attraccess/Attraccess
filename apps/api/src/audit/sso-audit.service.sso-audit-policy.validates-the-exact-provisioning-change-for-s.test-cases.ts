import { randomUUID } from 'node:crypto';
import { projectSsoAuditEvent } from './audit-policy';
import { registerSsoAuditPolicyFixture } from './sso-audit.service.sso-audit-policy.test-fixture';
export function registerValidatesTheExactProvisioningChangeForSCases(
  fixture: ReturnType<typeof registerSsoAuditPolicyFixture>,
) {
  it.each([
    ['sso.provisioning.sessions_revoked', 'sessionsRevoked'],
    ['sso.provisioning.user_created', 'userCreated'],
    ['sso.provisioning.user_deleted', 'userDeleted'],
  ])('validates the exact provisioning change for %s', (action, key) => {
    const event = {
      action,
      operationId: randomUUID(),
      actorId: null,
      authenticationMethod: null,
      subject: { type: 'user' as const, id: 9 },
      details: { provider: fixture.provider, changes: JSON.stringify({ [key]: true }) },
    };
    expect(projectSsoAuditEvent(event)).not.toBeNull();
    for (const changes of ['{', '{}', JSON.stringify({ [key]: false }), JSON.stringify({ [key]: true, extra: true })]) {
      expect(projectSsoAuditEvent({ ...event, details: { provider: fixture.provider, changes } })).toBeNull();
    }
  });
}
