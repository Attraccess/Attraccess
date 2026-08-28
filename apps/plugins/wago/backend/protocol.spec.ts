import {
  compatibilityError,
  configurationDesiredTopic,
  configurationReportedTopic,
  DISCOVERY_ROOT,
  discoveryTopic,
  heartbeatTopic,
  parseAnnouncement,
} from './protocol';

describe('WAGO protocol', () => {
  const valid = {
    hardwareId: 'cc100-01',
    pairingCode: '482931',
    protocolVersion: '1.2.0',
    runtimeVersion: '0.4.0',
    capabilities: ['claim', 'heartbeat'],
    sequence: 3,
  };

  it('accepts a complete announcement and preserves its protocol state', () => {
    expect(parseAnnouncement(Buffer.from(JSON.stringify(valid)))).toEqual(valid);
    expect(discoveryTopic(valid.hardwareId)).toBe(`${DISCOVERY_ROOT}/cc100-01`);
    expect(heartbeatTopic(valid.hardwareId)).toBe('attraccess/wago/controllers/cc100-01/heartbeat');
  });

  it('uses a versioned configuration protocol below the configurable operational prefix', () => {
    expect(configurationDesiredTopic('customer/wago/', 'cc100-01')).toBe(
      'customer/wago/v1/controllers/cc100-01/configuration/desired',
    );
    expect(configurationReportedTopic('customer/wago', 'cc100-01')).toBe(
      'customer/wago/v1/controllers/cc100-01/configuration/reported',
    );
  });

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
    expect(compatibilityError({ protocolVersion: '1.0.0', capabilities: valid.capabilities })).toBeNull();
  });
});
