import type { OperationResponse } from '@attraccess/matter-contract';

export type InventoryNode = OperationResponse<'inventory.get'>;
type InventoryEndpoint = InventoryNode['endpoints'][number];
type EndpointCluster = InventoryEndpoint['clusters'][number];
export type Administrator = InventoryNode['administrators'][number];

type ClusterState = Record<string, unknown>;
/** The part of a matter.js endpoint the mapping reads. Structural, so the mapping is testable without a device. */
export type EndpointLike = {
  number: number;
  state: Record<string, ClusterState | undefined>;
  behaviors: { supported: Record<string, { cluster?: { id: number; features?: Record<string, { id: number }> } }> };
};

const DESCRIPTOR = 'descriptor';
const BASIC_INFORMATION = 'basicInformation';
const BRIDGED_DEVICE_BASIC_INFORMATION = 'bridgedDeviceBasicInformation';

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value !== '' ? value.slice(0, max) : null;
const integer = (value: unknown, max: number): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : null;
const list = (value: unknown, max: number): number[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is number => Number.isInteger(entry) && entry >= 0).slice(0, max)
    : [];

/** matter.js decodes the feature map into named booleans; the contract carries the bitmap. */
function featureBits(state: ClusterState, features: Record<string, { id: number }> | undefined): number | null {
  const map = state.featureMap;
  if (!features || typeof map !== 'object' || map === null) return null;
  let bits = 0;
  for (const [name, set] of Object.entries(map)) if (set === true && features[name]) bits |= 1 << features[name].id;
  return bits >>> 0;
}

function clusterEntry(endpoint: EndpointLike, clusterId: number): EndpointCluster {
  const name = Object.keys(endpoint.behaviors.supported).find(
    (candidate) => endpoint.behaviors.supported[candidate].cluster?.id === clusterId,
  );
  const state = name ? endpoint.state[name] : undefined;
  const features = name ? endpoint.behaviors.supported[name].cluster?.features : undefined;
  return {
    clusterId,
    role: 'server',
    revision: state ? integer(state.clusterRevision, 0xffff) : null,
    featureMap: state ? featureBits(state, features) : null,
    attributeIds: state ? list(state.attributeList, 512) : [],
    acceptedCommandIds: state ? list(state.acceptedCommandList, 256) : [],
  };
}

function bridgedInfo(endpoint: EndpointLike, serverIds: number[]): InventoryEndpoint['bridged'] {
  // Cluster 0x39: Bridged Device Basic Information.
  if (!serverIds.includes(0x39)) return null;
  const state = endpoint.state[BRIDGED_DEVICE_BASIC_INFORMATION];
  if (!state) return null;
  return {
    uniqueId: text(state.uniqueId, 32),
    nodeLabel: text(state.nodeLabel, 32),
    vendorName: text(state.vendorName, 32),
    productName: text(state.productName, 32),
    serialNumber: text(state.serialNumber, 32),
    reachable: typeof state.reachable === 'boolean' ? state.reachable : null,
  };
}

/** The endpoint that lists `endpointId` in its parts, preferring a non-root one; the root lists everything on a flat node. */
function parentOf(endpointId: number, endpoints: EndpointLike[]): number | null {
  if (endpointId === 0) return null;
  const parents = endpoints
    .filter((candidate) => candidate.number !== endpointId)
    .filter((candidate) => list(candidate.state[DESCRIPTOR]?.partsList, 65_535).includes(endpointId))
    .map((candidate) => candidate.number);
  return parents.find((id) => id !== 0) ?? parents[0] ?? null;
}

export function describeEndpoint(endpoint: EndpointLike, all: EndpointLike[]): InventoryEndpoint {
  const descriptor = endpoint.state[DESCRIPTOR] ?? {};
  const serverIds = list(descriptor.serverList, 128);
  const clientIds = list(descriptor.clientList, 128);
  const deviceTypes = (Array.isArray(descriptor.deviceTypeList) ? descriptor.deviceTypeList : [])
    .flatMap((entry: { deviceType?: unknown; revision?: unknown }) => {
      const deviceTypeId = integer(entry?.deviceType, 0xffff_ffff);
      const revision = integer(entry?.revision, 0xffff);
      return deviceTypeId === null || revision === null ? [] : [{ deviceTypeId, revision }];
    })
    .slice(0, 32);
  const clusters: EndpointCluster[] = [
    ...serverIds.map((id) => clusterEntry(endpoint, id)),
    ...clientIds.map((clusterId) => ({
      clusterId,
      role: 'client' as const,
      revision: null,
      featureMap: null,
      attributeIds: [],
      acceptedCommandIds: [],
    })),
  ].slice(0, 128);
  return {
    endpointId: endpoint.number,
    parentEndpointId: parentOf(endpoint.number, all),
    deviceTypes,
    clusters,
    bridged: bridgedInfo(endpoint, serverIds),
  };
}

export type NodeFacts = {
  nodeId: string;
  reachable: boolean;
  endpoints: EndpointLike[];
  attestation: InventoryNode['attestation'];
  administrators: Administrator[];
  observedAt: string | null;
};

/** Maps what matter.js cached about one commissioned peer to the contract's node. */
export function describeNode(facts: NodeFacts): InventoryNode {
  const root = facts.endpoints.find((endpoint) => endpoint.number === 0);
  const basic = root?.state[BASIC_INFORMATION] ?? {};
  return {
    nodeId: facts.nodeId,
    reachable: facts.reachable,
    vendorId: integer(basic.vendorId, 0xffff),
    productId: integer(basic.productId, 0xffff),
    vendorName: text(basic.vendorName, 32),
    productName: text(basic.productName, 32),
    serialNumber: text(basic.serialNumber, 32),
    uniqueId: text(basic.uniqueId, 32),
    hardwareVersion: integer(basic.hardwareVersion, 0xffff),
    softwareVersion: integer(basic.softwareVersion, 0xffff_ffff),
    softwareVersionString: text(basic.softwareVersionString, 64),
    attestation: facts.attestation,
    endpoints: facts.endpoints.map((endpoint) => describeEndpoint(endpoint, facts.endpoints)).slice(0, 256),
    administrators: facts.administrators.slice(0, 254),
    observedAt: facts.observedAt,
  };
}

/** One entry of the Operational Credentials `fabrics` list, as matter.js decodes it. */
export type FabricDescriptorLike = { fabricIndex?: unknown; vendorId?: unknown; label?: unknown };

export function administratorsOf(fabrics: unknown, ownFabricIndex: number | undefined): Administrator[] {
  if (!Array.isArray(fabrics)) return [];
  return (fabrics as FabricDescriptorLike[]).flatMap((entry) => {
    const fabricIndex = integer(entry?.fabricIndex, 254);
    if (fabricIndex === null || fabricIndex < 1) return [];
    return [
      {
        fabricIndex,
        vendorId: integer(entry.vendorId, 0xffff),
        fabricLabel: text(entry.label, 32),
        isOwn: fabricIndex === ownFabricIndex,
      },
    ];
  });
}
