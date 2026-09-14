import {
  AdministrationAuditEvent,
  projectAdministrationAuditEvent,
  safeAuditOrigin,
  safeRequestedSpec,
} from './audit-administration-policy';

const event: AdministrationAuditEvent = {
  action: 'mqtt_server.created',
  actorId: 42,
  authenticationMethod: 'api-token',
  apiTokenId: 9,
  subjectType: 'mqtt-server',
  subjectId: 7,
  details: { host: 'mqtt.example.test', port: 8883, passwordChanged: 1 },
};

describe('administration audit policy', () => {
  it('preserves API-token attribution and clones only approved own scalar values', () => {
    const result = projectAdministrationAuditEvent(event);
    expect(result).toEqual(event);
    expect(result.details).not.toBe(event.details);
    event.details.port = 1883;
    expect(result.details.port).toBe(8883);
    event.details.port = 8883;
  });

  it.each(['password', 'token', 'caCert', 'clientSecret', 'body', 'registryCredentials', 'before'])(
    'rejects %s even when other fields are safe',
    (key) => {
      expect(
        projectAdministrationAuditEvent({ ...event, details: { ...event.details, [key]: 'secret-marker' } }),
      ).toBeNull();
    },
  );

  it.each([NaN, Infinity, -1, 1.5])('rejects an invalid numeric field %s', (port) => {
    expect(projectAdministrationAuditEvent({ ...event, details: { port } })).toBeNull();
  });

  it('rejects accessors without evaluating them and rejects inherited data', () => {
    const getter = jest.fn(() => 'secret');
    expect(
      projectAdministrationAuditEvent({ ...event, details: Object.defineProperty({}, 'host', { get: getter }) }),
    ).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(projectAdministrationAuditEvent({ ...event, details: Object.create({ host: 'hidden' }) })).toBeNull();
  });

  it('rejects incorrect targets and incomplete or inconsistent principals', () => {
    for (const invalid of [
      { actorId: 0 },
      { subjectId: 0 },
      { subjectType: 'setting' },
      { apiTokenId: undefined },
      { authenticationMethod: 'session' },
      { action: 'plugin.unknown' },
    ])
      expect(projectAdministrationAuditEvent({ ...event, ...invalid } as AdministrationAuditEvent)).toBeNull();
  });

  it('accepts safe setting snapshots but rejects arbitrary objects and credential values', () => {
    const setting = { ...event, action: 'settings.updated', subjectType: 'setting' };
    expect(
      projectAdministrationAuditEvent({
        ...setting,
        details: { settingKey: 'smtp.passConfigured', before: 'false', after: 'true' },
      }),
    ).not.toBeNull();
    for (const details of [
      { settingKey: 'smtp.pass', before: '', after: 'secret-marker' },
      { settingKey: 'smtp.passConfigured', before: 'false', after: 'secret-marker' },
      { settingKey: 'app.url', before: '', after: 'https://user:secret@example.com/path?token=secret-marker' },
      { settingKey: 'smtp.port', before: '25', after: '{"password":"secret-marker"}' },
    ])
      expect(projectAdministrationAuditEvent({ ...setting, details })).toBeNull();
  });

  it('removes credentials, query data and private paths from registry URLs and custom package specs', () => {
    expect(safeAuditOrigin('https://user:secret@example.com/private?token=secret#fragment')).toBe(
      'https://example.com',
    );
    for (const spec of [
      'git+ssh://user:secret@example.com/private',
      'file:/private/secret',
      'https://host/x?token=secret',
    ])
      expect(safeRequestedSpec(spec)).toBe('custom-source');
    for (const spec of ['latest', '^1.2.3', '1.2.3-beta.1', '>=1 <2']) expect(safeRequestedSpec(spec)).toBe(spec);
  });
});
