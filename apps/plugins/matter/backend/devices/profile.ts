// Pure mapping from an endpoint's clusters to its capabilities, its primary profile and its state keys.
// Deterministic: the same clusters always give the same result, in a stable order.
import type { ClusterRole } from './entities';

export const CAPABILITY_CLUSTERS = {
  onOff: 0x0006,
  levelControl: 0x0008,
  booleanState: 0x0045,
  occupancySensing: 0x0406,
  doorLock: 0x0101,
  electricalPowerMeasurement: 0x0090,
  electricalEnergyMeasurement: 0x0091,
  bridgedDeviceBasicInformation: 0x0039,
} as const;

export type CapabilityKey = keyof typeof CAPABILITY_CLUSTERS;

export const PROFILES = [
  'on_off_actuator',
  'dimmable_actuator',
  'contact_sensor',
  'occupancy_sensor',
  'lock',
  'power_meter',
  'bridge_aggregator',
  'generic',
] as const;
export type ProfileKey = (typeof PROFILES)[number];

/** Matter device type "Aggregator", the root of the endpoints a bridge exposes. */
export const AGGREGATOR_DEVICE_TYPE = 0x000e;

export type ClusterInput = { clusterId: number; role: ClusterRole; featureMap: number | null };
export type DerivedCapability = {
  capability: CapabilityKey;
  sourceClusterId: number;
  details: { featureMap: number | null; features: string[] };
};

const FEATURE_NAMES: Partial<Record<CapabilityKey, readonly string[]>> = {
  onOff: ['lighting', 'deadFrontBehavior', 'offOnly'],
  levelControl: ['onOff', 'lighting', 'frequency'],
  doorLock: [
    'pinCredential',
    'rfidCredential',
    'fingerCredentials',
    'logging',
    'weekDayAccessSchedules',
    'doorPositionSensor',
  ],
};

function featuresOf(capability: CapabilityKey, featureMap: number | null): string[] {
  const names = FEATURE_NAMES[capability];
  if (!names || featureMap === null) return [];
  return names.filter((_name, bit) => (featureMap & (1 << bit)) !== 0);
}

const CAPABILITY_BY_CLUSTER = new Map<number, CapabilityKey>(
  (Object.entries(CAPABILITY_CLUSTERS) as [CapabilityKey, number][]).map(([key, id]) => [id, key]),
);

/** Capabilities come from server clusters only. Unknown clusters produce none. Sorted by capability key. */
export function deriveCapabilities(clusters: readonly ClusterInput[]): DerivedCapability[] {
  const found = new Map<CapabilityKey, DerivedCapability>();
  for (const cluster of clusters) {
    if (cluster.role !== 'server') continue;
    const capability = CAPABILITY_BY_CLUSTER.get(cluster.clusterId);
    if (!capability || found.has(capability)) continue;
    found.set(capability, {
      capability,
      sourceClusterId: cluster.clusterId,
      details: { featureMap: cluster.featureMap, features: featuresOf(capability, cluster.featureMap) },
    });
  }
  return [...found.values()].sort((a, b) => a.capability.localeCompare(b.capability));
}

/** The primary profile. The first matching rule wins, so an endpoint has exactly one. */
export function deriveProfile(
  capabilities: readonly { capability: CapabilityKey | string }[],
  deviceTypeIds: readonly number[] = [],
): ProfileKey {
  const has = (key: CapabilityKey) => capabilities.some((entry) => entry.capability === key);
  if (deviceTypeIds.includes(AGGREGATOR_DEVICE_TYPE)) return 'bridge_aggregator';
  if (has('doorLock')) return 'lock';
  if (has('onOff') && has('levelControl')) return 'dimmable_actuator';
  if (has('onOff')) return 'on_off_actuator';
  if (has('booleanState')) return 'contact_sensor';
  if (has('occupancySensing')) return 'occupancy_sensor';
  if (has('electricalPowerMeasurement') || has('electricalEnergyMeasurement')) return 'power_meter';
  return 'generic';
}

/** Attribute names per capability, by attribute ID. Other attributes get `attr<id>`. */
const ATTRIBUTE_NAMES: Record<CapabilityKey, Record<number, string>> = {
  onOff: { 0x0000: 'onOff' },
  levelControl: { 0x0000: 'currentLevel' },
  booleanState: { 0x0000: 'stateValue' },
  occupancySensing: { 0x0000: 'occupancy' },
  doorLock: { 0x0000: 'lockState', 0x0003: 'doorState' },
  electricalPowerMeasurement: { 0x0008: 'activePower' },
  electricalEnergyMeasurement: { 0x0001: 'cumulativeEnergyImported' },
  bridgedDeviceBasicInformation: { 0x0011: 'reachable' },
};

/** `<capability>.<attribute>` for a cluster and attribute, or null when the cluster maps to no capability. */
export function stateKeyFor(clusterId: number, attributeId: number): string | null {
  const capability = CAPABILITY_BY_CLUSTER.get(clusterId);
  if (!capability) return null;
  return `${capability}.${ATTRIBUTE_NAMES[capability][attributeId] ?? `attr${attributeId}`}`;
}

/** The cluster behind a state key's capability, for validating requests against an endpoint. */
export function clusterOfCapability(capability: string): number | null {
  return (CAPABILITY_CLUSTERS as Record<string, number>)[capability] ?? null;
}
