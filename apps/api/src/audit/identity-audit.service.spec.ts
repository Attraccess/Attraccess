import { randomUUID } from 'node:crypto';
import { projectIdentityAuditEvent } from './audit-policy';

describe('identity audit policy', () => {
  it('projects an anonymous login with bounded request metadata', () => {
    expect(
      projectIdentityAuditEvent({
        action: 'login',
        operationId: randomUUID(),
        outcome: 'failed',
        details: { reason: 'invalid_credentials' },
        request: { ipAddress: '203.0.113.7', userAgent: 'Attraccess/1.0' },
      }),
    ).toEqual({
      action: 'identity.login',
      operationId: expect.any(String),
      outcome: 'failed',
      actorId: null,
      subjectType: 'identity.user',
      subjectId: null,
      details: { reason: 'invalid_credentials' },
      ipAddress: '203.0.113.7',
      userAgent: 'Attraccess/1.0',
    });
  });

  it('rejects secrets and arbitrary identity details', () => {
    const event = {
      action: 'login' as const,
      operationId: randomUUID(),
      outcome: 'failed' as const,
      details: { reason: 'invalid_credentials', password: 'not-stored' },
    };
    expect(projectIdentityAuditEvent(event)).toBeNull();
  });

  it('projects safe password policy snapshots with an override role', () => {
    expect(
      projectIdentityAuditEvent({
        action: 'password_policy_override_updated',
        operationId: randomUUID(),
        outcome: 'succeeded',
        subjectType: 'identity.password_policy',
        subjectId: 1,
        details: {
          role: 'admin',
          before: JSON.stringify({ role: 'admin', minLength: 12, requireDigit: null }),
          after: JSON.stringify({ role: 'admin', minLength: 16, requireDigit: true }),
          field: 'minLength',
        },
      }),
    ).toMatchObject({
      action: 'identity.password_policy_override_updated',
      subjectType: 'identity.password_policy',
      details: { role: 'admin' },
    });
  });
});
