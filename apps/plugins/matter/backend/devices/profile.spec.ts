import { CAPABILITY_CLUSTERS, deriveCapabilities, deriveProfile, stateKeyFor, type ClusterInput } from './profile';

const server = (clusterId: number, featureMap: number | null = null): ClusterInput => ({
  clusterId,
  role: 'server',
  featureMap,
});

describe('capability profile mapping', () => {
  it('maps every minimum capability from its server cluster', () => {
    for (const [capability, clusterId] of Object.entries(CAPABILITY_CLUSTERS)) {
      expect(deriveCapabilities([server(clusterId)])).toEqual([
        { capability, sourceClusterId: clusterId, details: { featureMap: null, features: [] } },
      ]);
    }
  });

  it('ignores client clusters and unknown clusters but keeps the known ones in stable order', () => {
    const result = deriveCapabilities([
      { clusterId: 0x0006, role: 'client', featureMap: null },
      server(0xfff1_0001),
      server(0x0008),
      server(0x0006),
    ]);
    expect(result.map((entry) => entry.capability)).toEqual(['levelControl', 'onOff']);
    expect(deriveCapabilities([server(0x0008), server(0x0006)])).toEqual(result);
  });

  it('reports feature flags', () => {
    expect(deriveCapabilities([server(0x0008, 0b011)])[0].details).toEqual({
      featureMap: 3,
      features: ['onOff', 'lighting'],
    });
  });

  it('picks exactly one primary profile by priority', () => {
    const profile = (...ids: number[]) => deriveProfile(deriveCapabilities(ids.map((id) => server(id))));
    expect(profile(0x0006)).toBe('on_off_actuator');
    expect(profile(0x0006, 0x0008)).toBe('dimmable_actuator');
    expect(profile(0x0045)).toBe('contact_sensor');
    expect(profile(0x0406)).toBe('occupancy_sensor');
    expect(profile(0x0101, 0x0006)).toBe('lock');
    expect(profile(0x0090)).toBe('power_meter');
    expect(profile(0x0006, 0x0090)).toBe('on_off_actuator');
    expect(profile(0xfff1_0001)).toBe('generic');
    expect(deriveProfile([], [0x000e])).toBe('bridge_aggregator');
  });

  it('builds state keys and leaves unmapped clusters out', () => {
    expect(stateKeyFor(0x0006, 0)).toBe('onOff.onOff');
    expect(stateKeyFor(0x0006, 0x4001)).toBe('onOff.attr16385');
    expect(stateKeyFor(0xfff1_0001, 0)).toBeNull();
  });
});
