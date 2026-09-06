import { randomUUID } from 'node:crypto';
import { PluginAuditEvent } from '@attraccess/plugins-backend-sdk';
import { projectAuditEvent } from './audit-policy';

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
});
