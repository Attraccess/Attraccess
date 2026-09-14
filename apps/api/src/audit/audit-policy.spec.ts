import { randomUUID } from 'node:crypto';
import { PluginAuditEvent } from '@attraccess/plugins-backend-sdk';
import { projectAuditEvent, projectIdentityAuditEvent, projectResourceAuditEvent } from './audit-policy';

function event(): PluginAuditEvent & { pluginId: string } {
  return {
    pluginId: 'abcdefghijklmnopqrstu',
    action: 'wago.publication',
    operationId: randomUUID(),
    principal: { userId: 42, authenticationMethod: 'session' },
    outcome: 'succeeded',
    subject: { type: 'wago.controller', id: 7 },
    details: { revision: 2 },
  };
}

describe('audit storage safe snapshot', () => {
  it('detaches all caller data before asynchronous work', () => {
    const input = event();
    const snapshot = projectAuditEvent(input);
    input.action = 'raw-secret';
    input.principal.userId = 9;
    input.subject.id = 9;
    Object.assign(input.details, { revision: 'raw-secret' });
    input.details = { revision: 'raw-secret' };
    expect(snapshot).toEqual({
      ...event(),
      operationId: input.operationId,
    });
    expect(Object.getPrototypeOf(snapshot.details)).toBeNull();
  });

  it.each(['action', 'principal', 'subject', 'details'])('rejects %s accessors without invoking them', (key) => {
    const input = event();
    const getter = jest.fn(() => 'raw-secret');
    Object.defineProperty(input, key, { get: getter, enumerable: true });
    expect(projectAuditEvent(input)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects getters nested in otherwise valid details or principal', () => {
    for (const [key, field] of [
      ['details', 'revision'],
      ['principal', 'userId'],
    ] as const) {
      const input = event();
      const getter = jest.fn().mockReturnValueOnce(2).mockReturnValue('raw-secret');
      Object.defineProperty(input[key], field, { get: getter, enumerable: true });
      expect(projectAuditEvent(input)).toBeNull();
      expect(getter).not.toHaveBeenCalled();
    }
  });

  it('does not admit TypeORM SQL-expression functions as persisted identifiers', () => {
    const expression = jest.fn(() => '(SELECT 1)');
    expect(
      projectAuditEvent({ ...event(), principal: { userId: expression, authenticationMethod: 'session' } }),
    ).toBeNull();
    expect(projectAuditEvent({ ...event(), subject: { type: 'wago.controller', id: expression } })).toBeNull();
    expect(expression).not.toHaveBeenCalled();
  });

  it('rejects custom serialization, hidden fields, symbols and inherited payloads', () => {
    const toJSON = jest.fn(() => ({ password: 'raw-secret' }));
    for (const details of [
      { revision: 2, toJSON },
      Object.create({ toJSON }, { revision: { value: 2, enumerable: true } }),
      Object.defineProperty({ revision: 2 }, 'password', { value: 'raw-secret' }),
      { revision: 2, [Symbol('payload')]: 'raw-secret' },
    ]) {
      expect(projectAuditEvent({ ...event(), details })).toBeNull();
    }
    expect(toJSON).not.toHaveBeenCalled();
  });

  it('rejects cyclic values, arbitrary telemetry, and throwing proxies without leaking exceptions', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.revision = cyclic;
    expect(projectAuditEvent({ ...event(), details: cyclic })).toBeNull();
    expect(projectAuditEvent({ ...event(), action: 'wago.telemetry' })).toBeNull();
    expect(
      projectAuditEvent(
        new Proxy(event(), {
          ownKeys: () => {
            throw new Error('raw-secret');
          },
        }),
      ),
    ).toBeNull();
  });

  it('allows only reviewed resource fields, including safe resource administration projections', () => {
    const resourceEvent = {
      action: 'maintenance_schedule.created' as const,
      operationId: randomUUID(),
      actorId: 42,
      subjectId: 7,
      details: { scheduleId: 3, enabled: 1, triggerType: 'usage_count', usageThreshold: 12 },
    };
    expect(projectResourceAuditEvent(resourceEvent)).toEqual(resourceEvent);
    expect(projectResourceAuditEvent({ ...resourceEvent, details: { password: 'raw-secret' } })).toBeNull();
    const deletion = {
      action: 'resource.deleted' as const,
      operationId: randomUUID(),
      actorId: 42,
      subjectId: 7,
      details: { 'before.name': 'Lathe', 'before.type': 'machine' },
    };
    expect(projectResourceAuditEvent(deletion)).toEqual(deletion);
    expect(projectResourceAuditEvent({ ...deletion, details: { password: 'raw-secret' } })).toBeNull();
  });

  it('accepts generated role keys truncated after a separator', () => {
    expect(
      projectIdentityAuditEvent({
        action: 'role_created',
        operationId: randomUUID(),
        outcome: 'succeeded',
        subjectType: 'identity.role',
        subjectId: 1,
        details: { role: `${'a'.repeat(79)}-` },
      }),
    ).toMatchObject({ details: { role: `${'a'.repeat(79)}-` } });
  });

  it('allows system-origin lifecycle events but rejects mixed origins', () => {
    const resourceEvent = {
      action: 'usage_session.ended' as const,
      operationId: randomUUID(),
      actorId: null,
      subjectId: 7,
      details: { usageId: 3, usageUserId: 42 },
    };
    expect(projectResourceAuditEvent(resourceEvent)).toEqual(resourceEvent);
    expect(projectResourceAuditEvent({ ...resourceEvent, authenticationMethod: 'session' })).toBeNull();
    expect(projectResourceAuditEvent({ ...resourceEvent, apiTokenId: 4 })).toBeNull();
  });

  it('allows explicitly system-originated introductions without synthesizing a user session', () => {
    const event = {
      action: 'introduction.granted' as const,
      operationId: randomUUID(),
      actorId: null,
      authenticationMethod: null,
      subjectId: 7,
      details: { recipientUserId: 3, tutorUserId: 9 },
    };

    expect(projectResourceAuditEvent(event)).toEqual(event);
    expect(projectResourceAuditEvent({ ...event, authenticationMethod: 'session' })).toBeNull();
  });
});
