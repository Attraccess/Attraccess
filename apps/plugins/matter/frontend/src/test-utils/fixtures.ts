// Fixtures for the Matter page specs: a connection status, nodes, endpoints and state entries as the REST API returns them.
import type { ConnectionSettings, ConnectionStatus } from '../api';
import type {
  MatterEndpointDetail,
  MatterNodeDetail,
  MatterNodeSummary,
  ReconciliationStatus,
  StateEntry,
} from '../devices/api';

export const SUPPORTED = {
  wireVersion: 1,
  attraccess: '^2.0.0',
  plugin: '0.4.0-alpha.0',
  sidecar: '0.4.0-alpha.0',
  matterJs: '0.18.0',
};

export const status = (overrides: Partial<ConnectionStatus> = {}): ConnectionStatus => ({
  state: 'connected',
  reason: null,
  reasonDetail: null,
  since: '2026-11-06T10:00:00.000Z',
  lastError: null,
  nextRetryAt: null,
  sidecar: { sidecar: '0.4.0-alpha.0', matterJs: '0.18.0', wireVersion: 1, build: { version: '0.4.0-alpha.0' } },
  wireVersion: 1,
  capabilities: {
    capabilities: [
      { family: 'inventory', available: true },
      { family: 'fabric', available: true },
      { family: 'backup', available: true },
    ],
  },
  insecureTransport: false,
  supported: [SUPPORTED],
  ...overrides,
});

export const configuredSettings: ConnectionSettings = {
  url: 'https://matter.example.com',
  credentialConfigured: true,
  credentialUpdatedAt: '2026-11-05T09:00:00.000Z',
  caCertificate: '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----',
  updatedAt: '2026-11-05T09:00:00.000Z',
};

export const node = (id: string, overrides: Partial<MatterNodeSummary> = {}): MatterNodeSummary => ({
  id,
  fabricRef: 'fabric-1',
  nodeId: id.replace('node-', ''),
  lifecycleState: 'claimed',
  detachedReason: null,
  reachable: true,
  identity: {
    vendorId: 4874,
    productId: 1,
    vendorName: 'Acme',
    productName: 'Plug',
    serialNumber: `SN-${id}`,
    uniqueId: `U-${id}`,
    hardwareVersion: 2,
    softwareVersion: 3,
    softwareVersionString: '1.0.3',
    attestation: { status: 'verified', checkedAt: '2026-10-29T10:00:00.000Z' },
  },
  metadata: { displayName: null, description: null, location: null },
  firstSeenAt: '2026-10-29T10:00:00.000Z',
  lastSeenAt: '2026-11-06T10:00:00.000Z',
  claimedAt: null,
  detachedAt: null,
  archivedAt: null,
  removedAt: null,
  removalReason: null,
  updatedAt: '2026-11-06T10:00:00.000Z',
  endpointCount: 2,
  ...overrides,
});

export const endpoint = (endpointId: number, overrides: Partial<MatterEndpointDetail> = {}): MatterEndpointDetail => ({
  id: `endpoint-${endpointId}`,
  nodeRef: 'node-1',
  endpointId,
  parentEndpointId: endpointId === 0 ? null : 0,
  deviceTypes: [{ deviceTypeId: 0x010a, revision: 3 }],
  profile: 'on_off_actuator',
  metadata: { displayName: null, description: null, location: null },
  bridged: null,
  lastSeenAt: '2026-11-06T10:00:00.000Z',
  removedAt: null,
  clusters: [
    {
      clusterId: 0x0006,
      role: 'server',
      revision: 1,
      featureMap: 0,
      attributeIds: [0, 1],
      acceptedCommandIds: [0, 1, 2],
    },
  ],
  capabilities: [{ capability: 'onOff', sourceClusterId: 0x0006, details: { lighting: true } }],
  ...overrides,
});

export const detail = (id: string, overrides: Partial<MatterNodeDetail> = {}): MatterNodeDetail => ({
  ...node(id),
  fabric: { id: 'fabric-1', fabricId: '1', status: 'active', label: null },
  endpoints: [endpoint(0, { profile: 'generic' }), endpoint(1, { parentEndpointId: 0 })],
  ...overrides,
});

export const stateEntry = (overrides: Partial<StateEntry> = {}): StateEntry => ({
  stateKey: 'onOff.onOff',
  reported: { value: true, observedAt: '2026-11-06T10:00:00.000Z', receivedAt: '2026-11-06T10:00:01.000Z' },
  freshness: 'fresh',
  requested: { value: null, requestedAt: null },
  command: { state: 'none' },
  confirmed: false,
  fault: null,
  uncertainActuation: false,
  ...overrides,
});

/** A reconciliation status; by default no run yet. */
export const reconciliation = (overrides: Partial<ReconciliationStatus> = {}): ReconciliationStatus => ({
  lastStartedAt: null,
  lastFinishedAt: null,
  lastResult: null,
  lastSummary: null,
  sidecarFabricId: null,
  events: {},
  ...overrides,
});
