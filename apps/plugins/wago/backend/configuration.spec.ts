import { canonicalSnapshot, configurationHash, validateSnapshot } from './configuration';

describe('WAGO configuration snapshots', () => {
  it('hashes equivalent snapshots identically regardless of object key order', () => {
    expect(configurationHash({ logicalChannels: [], hardwareProfiles: [] })).toBe(
      configurationHash({ hardwareProfiles: [], logicalChannels: [] }),
    );
    expect(canonicalSnapshot({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('reports every broken reference instead of accepting a partial snapshot', () => {
    expect(
      validateSnapshot({
        logicalChannels: [
          { id: 'channel-a', physicalPointId: 'missing-point' },
          { id: 'channel-b', hardwareProfileId: 'missing-profile' },
        ],
      }),
    ).toEqual([
      expect.objectContaining({ path: 'logicalChannels[0].physicalPointId', code: 'missing_reference' }),
      expect.objectContaining({ path: 'logicalChannels[1].hardwareProfileId', code: 'missing_reference' }),
    ]);
  });
});
