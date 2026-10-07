// Contract fixtures describe the producer's persisted configuration.
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { Snapshot } from '../cc100-runtime/src/runtime';
export const prefix = 'contract/wago';
export const root = `${prefix}/v1/controllers/fixture-cc100`;
export const timestamp = '2026-09-05T12:00:00.000Z';
// Same hardware-profile:channel initial-values format used by ATT-1048's simulator.
export const fixtures = [
  { channelId: 'current', raw: 0.5, unit: 'ampere', wireUnit: 'milliampere', value: 500, kind: 'live' as const },
  { channelId: 'voltage', raw: 230.5, unit: 'volt', wireUnit: 'millivolt', value: 230500, kind: 'live' as const },
  { channelId: 'power', raw: -12.25, unit: 'watt', wireUnit: 'milliwatt', value: -12250, kind: 'live' as const },
  {
    channelId: 'energy',
    raw: 1234.5,
    unit: 'watt-hour',
    wireUnit: 'milliwatt-hour',
    value: 1234500,
    kind: 'cumulative' as const,
  },
  { channelId: 'level', raw: 12.345, unit: 'percent', wireUnit: 'millipercent', value: 12345, kind: 'live' as const },
];
export const snapshot: Snapshot = {
  version: 1,
  physicalPoints: fixtures.map((fixture, channel) => ({ id: fixture.channelId, hardwareProfile: '751-9301', channel })),
  logicalChannels: fixtures.map((fixture) => ({
    id: fixture.channelId,
    physicalPointId: fixture.channelId,
    profile: 'meter',
    capabilities: ['measurement'],
    disconnectPolicy: { mode: 'hold' },
    measurement: { unit: fixture.unit, scale: 1, offset: 0, kind: fixture.kind },
  })),
};
