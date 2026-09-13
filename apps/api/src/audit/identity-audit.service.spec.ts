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
      authenticationMethod: null,
      apiTokenId: null,
      subjectType: 'identity.user',
      subjectId: null,
      details: { reason: 'invalid_credentials' },
      ipAddress: '203.0.113.7',
      userAgent: 'Attraccess/1.0',
    });
  });

  it('retains events with oversized client metadata', () => {
    expect(
      projectIdentityAuditEvent({
        action: 'login',
        operationId: randomUUID(),
        outcome: 'failed',
        details: { reason: 'invalid_credentials' },
        request: { ipAddress: 'not-an-ip', userAgent: 'a'.repeat(513) },
      }),
    ).toMatchObject({
      action: 'identity.login',
      ipAddress: null,
      userAgent: 'a'.repeat(512),
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
          role: '24-hour-access',
          before: JSON.stringify({ role: '24-hour-access', minLength: 12, requireDigit: null }),
          after: JSON.stringify({ role: '24-hour-access', minLength: 16, requireDigit: true }),
          field: 'minLength',
        },
      }),
    ).toMatchObject({
      action: 'identity.password_policy_override_updated',
      subjectType: 'identity.password_policy',
      details: { role: '24-hour-access' },
    });
  });

  it('accepts long role keys generated after collisions', () => {
    const role = `${'a'.repeat(80)}-2`;
    expect(
      projectIdentityAuditEvent({
        action: 'role_created',
        operationId: randomUUID(),
        outcome: 'succeeded',
        subjectType: 'identity.role',
        subjectId: 1,
        details: { role },
      }),
    ).toMatchObject({ details: { role } });
  });

  it('retains API-token attribution for an authenticated actor', () => {
    expect(
      projectIdentityAuditEvent({
        action: 'user_updated',
        operationId: randomUUID(),
        outcome: 'succeeded',
        actorId: 7,
        authenticationMethod: 'api-token',
        apiTokenId: 19,
        subjectId: 4,
        details: { field: 'email' },
      }),
    ).toMatchObject({ actorId: 7, authenticationMethod: 'api-token', apiTokenId: 19 });
  });
});
