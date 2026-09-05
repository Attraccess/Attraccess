import {
  compatibilityError,
  configurationDesiredTopic,
  acknowledgementHardwareId,
  acknowledgementTopic,
  acknowledgementWildcardTopic,
  configurationReportedHardwareId,
  configurationReportedTopic,
  configurationReportedWildcardTopic,
  DISCOVERY_ROOT,
  discoveryTopic,
  heartbeatTopic,
  parseAnnouncement,
  parseHeartbeat,
} from './protocol';

describe('WAGO protocol', () => {
  const valid = {
    hardwareId: 'cc100-01',
    pairingCode: '482931',
    protocolVersion: '1.2.0',
    runtimeVersion: '0.4.0',
    capabilities: ['claim', 'heartbeat', 'configuration-v1'],
    sequence: 3,
  };

  it('accepts a complete announcement and preserves its protocol state', () => {
    expect(parseAnnouncement(Buffer.from(JSON.stringify(valid)))).toEqual(valid);
    expect(discoveryTopic(valid.hardwareId)).toBe(`${DISCOVERY_ROOT}/cc100-01`);
    expect(heartbeatTopic('attraccess/wago', valid.hardwareId)).toBe(
      'attraccess/wago/v1/controllers/cc100-01/heartbeat',
    );
  });

  it('accepts runtime heartbeats without weakening physical discovery verification', () => {
    const heartbeat = { ...valid };
    delete heartbeat.pairingCode;
    const payload = Buffer.from(JSON.stringify(heartbeat));
    expect(parseHeartbeat(payload)).toEqual(heartbeat);
    expect(() => parseAnnouncement(payload)).toThrow('pairingCode is required');
    expect(() => parseHeartbeat(Buffer.from(JSON.stringify({ ...heartbeat, sequence: -1 })))).toThrow();
    expect(() => parseHeartbeat(Buffer.from(JSON.stringify({ ...heartbeat, hardwareId: '' })))).toThrow();
  });

  it('uses a versioned configuration protocol below the configurable operational prefix', () => {
    expect(configurationDesiredTopic('customer/wago/', 'cc100-01')).toBe(
      'customer/wago/v1/controllers/cc100-01/configuration/desired',
    );
    expect(configurationReportedTopic('customer/wago', 'cc100-01')).toBe(
      'customer/wago/v1/controllers/cc100-01/configuration/reported',
    );
    expect(configurationReportedWildcardTopic('customer/wago')).toBe(
      'customer/wago/v1/controllers/+/configuration/reported',
    );
    expect(acknowledgementTopic('customer/wago', 'cc100-01')).toBe(
      'customer/wago/v1/controllers/cc100-01/acknowledgements',
    );
    expect(acknowledgementWildcardTopic('customer/wago')).toBe(
      'customer/wago/v1/controllers/+/acknowledgements',
    );
    expect(acknowledgementHardwareId('customer/wago', 'customer/wago/v1/controllers/cc100-01/acknowledgements')).toBe(
      'cc100-01',
    );
    expect(
      configurationReportedHardwareId('customer/wago', 'customer/wago/v1/controllers/cc100-01/configuration/reported'),
    ).toBe('cc100-01');
    expect(
      configurationReportedHardwareId('customer/wago', 'customer/wago/v1/controllers/+/configuration/reported'),
    ).toBeNull();
  });

  it.each(['', '/', 'customer//wago', 'customer/+/wago', 'customer/#/wago'])(
    'rejects invalid operational prefix %j',
    (prefix) => {
      expect(() => configurationDesiredTopic(prefix, valid.hardwareId)).toThrow(
        'MQTT prefix must contain non-empty segments without wildcards',
      );
    },
  );

  it.each([
    ['invalid JSON', Buffer.from('{')],
    ['missing pairing code', Buffer.from(JSON.stringify({ ...valid, pairingCode: '' }))],
    ['invalid capabilities', Buffer.from(JSON.stringify({ ...valid, capabilities: ['claim', 1] }))],
    ['negative sequence', Buffer.from(JSON.stringify({ ...valid, sequence: -1 }))],
  ])('rejects %s', (_label, payload) => expect(() => parseAnnouncement(payload)).toThrow());

  it('provides actionable compatibility guidance', () => {
    expect(compatibilityError({ protocolVersion: '2.0.0', capabilities: valid.capabilities })).toContain(
      'supports protocol 1.x',
    );
    expect(compatibilityError({ protocolVersion: '1.0.0', capabilities: ['claim'] })).toContain('heartbeat');
    expect(compatibilityError({ protocolVersion: '1.0.0', capabilities: ['claim', 'heartbeat'] })).toContain(
      'configuration-v1',
    );
    expect(compatibilityError({ protocolVersion: '1.0.0', capabilities: valid.capabilities })).toBeNull();
  });
});
