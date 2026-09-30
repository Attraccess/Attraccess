import { randomUUID } from 'node:crypto';
import type { PluginAuditDomainDeclaration, PluginAuditEvent } from '@attraccess/plugins-backend-sdk';
import {
  registerPluginAuditDomains,
  resetPluginAuditRegistry,
} from '../plugin-system/plugin-audit-registry';
import { projectPluginAuditEvent } from './plugin-audit-policy';

const pluginId = 'abcdefghijklmnopqrstu';
const otherPluginId = 'aaaaaaaaaaaaaaaaaaaaa';

const demoDomain: PluginAuditDomainDeclaration = {
  domain: 'demo',
  labels: { en: 'Demo devices' },
  actions: [
    {
      action: 'demo.publication',
      subjectTypes: ['demo.device'],
      details: { revision: { type: 'number', integer: true, min: 1 } },
    },
    {
      action: 'demo.rollback',
      subjectTypes: ['demo.device'],
      details: {
        sourceRevision: { type: 'number', integer: true, min: 1 },
        revision: { type: 'number', integer: true, min: 1 },
      },
    },
    {
      action: 'demo.manual_command',
      subjectTypes: ['demo.device'],
      details: {
        channelId: { type: 'string', pattern: '[a-zA-Z0-9_-]{1,64}' },
        operation: { type: 'string', oneOf: ['set', 'pulse'] },
        ratio: { type: 'number', min: 0, max: 1 },
        label: { type: 'string', maxLength: 8 },
        note: { type: 'string', maxLength: 4096 },
        flagged: { type: 'boolean' },
      },
    },
    { action: 'demo.commissioning.install', subjectTypes: ['demo.commissioning'] },
  ],
};

function event(): PluginAuditEvent & { pluginId: string } {
  return {
    pluginId,
    action: 'demo.publication',
    operationId: randomUUID(),
    principal: { userId: 42, authenticationMethod: 'session' },
    outcome: 'succeeded',
    subject: { type: 'demo.device', id: 7 },
    details: { revision: 2 },
  };
}

describe('plugin audit projection', () => {
  beforeAll(() => {
    registerPluginAuditDomains({ name: '@example/plugin-demo', id: pluginId }, [demoDomain]);
  });
  afterAll(() => {
    resetPluginAuditRegistry();
  });

  it('projects a declared event into a flat host-owned snapshot', () => {
    const input = event();
    expect(projectPluginAuditEvent(input)).toEqual({
      domain: 'demo',
      pluginId,
      action: 'demo.publication',
      operationId: input.operationId,
      outcome: 'succeeded',
      actorId: 42,
      authenticationMethod: 'session',
      subjectType: 'demo.device',
      subjectId: 7,
      details: { revision: 2 },
    });
  });

  it('accepts api-token principals only with a token id', () => {
    expect(
      projectPluginAuditEvent({
        ...event(),
        principal: { userId: 42, authenticationMethod: 'api-token', apiTokenId: 19 },
      }),
    ).toMatchObject({ authenticationMethod: 'api-token', apiTokenId: 19 });
    expect(
      projectPluginAuditEvent({ ...event(), principal: { userId: 42, authenticationMethod: 'api-token' } }),
    ).toBeNull();
    expect(
      projectPluginAuditEvent({
        ...event(),
        principal: { userId: 42, authenticationMethod: 'session', apiTokenId: 19 },
      }),
    ).toBeNull();
  });

  it('rejects events for unregistered domains and undeclared actions', () => {
    expect(projectPluginAuditEvent({ ...event(), action: 'unknown.publication' })).toBeNull();
    expect(projectPluginAuditEvent({ ...event(), action: 'demo.telemetry' })).toBeNull();
    expect(projectPluginAuditEvent({ ...event(), action: 'demo' })).toBeNull();
    expect(projectPluginAuditEvent({ ...event(), action: 42 })).toBeNull();
  });

  it('rejects events recorded by a plugin that does not own the domain', () => {
    expect(projectPluginAuditEvent({ ...event(), pluginId: otherPluginId })).toBeNull();
    expect(projectPluginAuditEvent({ ...event(), pluginId: 'short' })).toBeNull();
  });

  it('rejects undeclared subject types and non-positive subject ids', () => {
    expect(projectPluginAuditEvent({ ...event(), subject: { type: 'demo.other', id: 7 } })).toBeNull();
    expect(projectPluginAuditEvent({ ...event(), subject: { type: 'demo.device', id: 0 } })).toBeNull();
    const commissioning = projectPluginAuditEvent({
      ...event(),
      action: 'demo.commissioning.install',
      subject: { type: 'demo.commissioning', id: 3 },
      details: {},
    });
    expect(commissioning).toMatchObject({ subjectType: 'demo.commissioning', subjectId: 3 });
  });

  it('enforces declared field policies and rejects undeclared detail fields', () => {
    const command = {
      ...event(),
      action: 'demo.manual_command',
      details: { channelId: 'ch_1', operation: 'set', ratio: 0.5, label: 'short', flagged: true },
    };
    expect(projectPluginAuditEvent(command)).toMatchObject({ details: command.details });
    expect(projectPluginAuditEvent({ ...command, details: { ...command.details, operation: 'toggle' } })).toBeNull();
    expect(projectPluginAuditEvent({ ...command, details: { ...command.details, channelId: '!' } })).toBeNull();
    expect(projectPluginAuditEvent({ ...command, details: { ...command.details, ratio: 2 } })).toBeNull();
    expect(projectPluginAuditEvent({ ...command, details: { ...command.details, label: 'far too long' } })).toBeNull();
    expect(projectPluginAuditEvent({ ...command, details: { ...command.details, flagged: 'yes' } })).toBeNull();
    expect(projectPluginAuditEvent({ ...command, details: { ...command.details, secret: 'x' } })).toBeNull();
    expect(projectPluginAuditEvent({ ...event(), details: { revision: 0 } })).toBeNull();
    expect(projectPluginAuditEvent({ ...event(), details: { revision: 1.5 } })).toBeNull();
    expect(projectPluginAuditEvent({ ...event(), details: { revision: '2' } })).toBeNull();
    expect(projectPluginAuditEvent({ ...event(), details: { revision: null } })).toBeNull();
  });

  it('rejects details payloads above the host byte limit', () => {
    expect(
      projectPluginAuditEvent({
        ...event(),
        action: 'demo.manual_command',
        details: { note: 'a'.repeat(4096) },
      }),
    ).toBeNull();
    expect(
      projectPluginAuditEvent({
        ...event(),
        action: 'demo.manual_command',
        details: { note: 'a'.repeat(4000) },
      }),
    ).toMatchObject({ details: { note: 'a'.repeat(4000) } });
  });

  it('detaches all caller data before asynchronous work', () => {
    const input = event();
    const snapshot = projectPluginAuditEvent(input);
    input.action = 'raw-secret';
    input.principal.userId = 9;
    input.subject.id = 9;
    Object.assign(input.details, { revision: 'raw-secret' });
    expect(snapshot).toMatchObject({
      action: 'demo.publication',
      actorId: 42,
      subjectId: 7,
      details: { revision: 2 },
    });
    expect(Object.getPrototypeOf(snapshot?.details)).toBeNull();
  });

  it.each(['action', 'principal', 'subject', 'details'])('rejects %s accessors without invoking them', (key) => {
    const input = event();
    const getter = jest.fn(() => 'raw-secret');
    Object.defineProperty(input, key, { get: getter, enumerable: true });
    expect(projectPluginAuditEvent(input)).toBeNull();
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
      expect(projectPluginAuditEvent(input)).toBeNull();
      expect(getter).not.toHaveBeenCalled();
    }
  });

  it('does not admit TypeORM SQL-expression functions as persisted identifiers', () => {
    const expression = jest.fn(() => '(SELECT 1)');
    expect(
      projectPluginAuditEvent({ ...event(), principal: { userId: expression, authenticationMethod: 'session' } }),
    ).toBeNull();
    expect(projectPluginAuditEvent({ ...event(), subject: { type: 'demo.device', id: expression } })).toBeNull();
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
      expect(projectPluginAuditEvent({ ...event(), details })).toBeNull();
    }
    expect(toJSON).not.toHaveBeenCalled();
  });

  it('rejects cyclic values and throwing proxies without leaking exceptions', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.revision = cyclic;
    expect(projectPluginAuditEvent({ ...event(), details: cyclic })).toBeNull();
    expect(
      projectPluginAuditEvent(
        new Proxy(event(), {
          ownKeys: () => {
            throw new Error('raw-secret');
          },
        }),
      ),
    ).toBeNull();
  });

  it('rejects malformed operation ids and outcomes', () => {
    expect(projectPluginAuditEvent({ ...event(), operationId: 'not-a-uuid' })).toBeNull();
    expect(projectPluginAuditEvent({ ...event(), outcome: 'unknown' })).toBeNull();
  });
});

describe('plugin audit registry', () => {
  afterEach(() => {
    resetPluginAuditRegistry();
  });

  it('rejects declarations that collide with core domains', () => {
    expect(() =>
      registerPluginAuditDomains({ name: '@example/plugin-demo', id: pluginId }, [
        { domain: 'resource', actions: [{ action: 'resource.stolen', subjectTypes: ['resource.thing'] }] },
      ]),
    ).toThrow(/reserved for the host/);
  });

  it('rejects a second plugin claiming an already registered domain', () => {
    registerPluginAuditDomains({ name: '@example/plugin-demo', id: pluginId }, [demoDomain]);
    expect(() =>
      registerPluginAuditDomains({ name: '@example/plugin-other', id: otherPluginId }, [demoDomain]),
    ).toThrow(/already registered/);
  });

  it('registers nothing when any declaration in the batch is invalid', () => {
    expect(() =>
      registerPluginAuditDomains({ name: '@example/plugin-demo', id: pluginId }, [
        demoDomain,
        { domain: 'demo', actions: [{ action: 'demo.duplicate', subjectTypes: ['demo.device'] }] },
      ]),
    ).toThrow(/already registered/);
    expect(projectPluginAuditEvent(event())).toBeNull();
  });
});
