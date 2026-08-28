import { canonicalSnapshot, configurationHash, validateSnapshot } from './configuration';

describe('WAGO configuration snapshots', () => {
  it('hashes equivalent snapshots identically regardless of object key order', () => {
    expect(configurationHash({ version: 1, physicalPoints: [], logicalChannels: [] })).toBe(
      configurationHash({ logicalChannels: [], physicalPoints: [], version: 1 }),
    );
    expect(canonicalSnapshot({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('reports every broken reference instead of accepting a partial snapshot', () => {
    expect(
      validateSnapshot({
        version: 1,
        physicalPoints: [],
        logicalChannels: [
          {
            id: 'channel-a',
            physicalPointId: 'missing-point',
            profile: 'generic-digital-output',
            capabilities: ['output'],
            disconnectPolicy: { mode: 'hold' },
          },
        ],
      }),
    ).toEqual([expect.objectContaining({ path: 'logicalChannels[0].physicalPointId', code: 'missing_reference' })]);
  });

  it('rejects empty, unknown, and opaque configuration fields', () => {
    expect(
      validateSnapshot({
        version: 1,
        physicalPoints: [],
        logicalChannels: [],
        policy: {},
      }),
    ).toEqual([expect.objectContaining({ path: 'policy', code: 'unknown_field' })]);
  });

  it('requires a complete versioned channel contract', () => {
    expect(validateSnapshot({})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'version', code: 'required_field' }),
        expect.objectContaining({ path: 'physicalPoints', code: 'required_field' }),
        expect.objectContaining({ path: 'logicalChannels', code: 'required_field' }),
      ]),
    );
  });
});
