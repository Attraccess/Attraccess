// The device REST API (`/api/matter/nodes`, `/endpoints`, `/reconciliation`). Types mirror backend/devices/views.ts.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import { matterRequest } from '../matterApi';

export const LIFECYCLE_STATES = ['unclaimed', 'claimed', 'detached', 'archived', 'removed'] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];
export type DetachedReason = 'absent_from_sidecar' | 'fabric_mismatch' | 'fabric_absent';

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

export interface Metadata {
  displayName: string | null;
  description: string | null;
  location: string | null;
}

export interface NodeIdentity {
  vendorId: number | null;
  productId: number | null;
  vendorName: string | null;
  productName: string | null;
  serialNumber: string | null;
  uniqueId: string | null;
  hardwareVersion: number | null;
  softwareVersion: number | null;
  softwareVersionString: string | null;
  attestation: { status: string | null; checkedAt: string | null };
}

export interface MatterNodeSummary {
  id: string;
  fabricRef: string;
  nodeId: string;
  lifecycleState: LifecycleState;
  detachedReason: DetachedReason | null;
  reachable: boolean | null;
  identity: NodeIdentity;
  metadata: Metadata;
  firstSeenAt: string;
  lastSeenAt: string;
  claimedAt: string | null;
  detachedAt: string | null;
  archivedAt: string | null;
  removedAt: string | null;
  removalReason: string | null;
  updatedAt: string;
  /** Only the list carries it: the number of live endpoints. */
  endpointCount?: number;
}

export interface EndpointBridge {
  uniqueId: string | null;
  nodeLabel: string | null;
  vendorName: string | null;
  productName: string | null;
  serialNumber: string | null;
  reachable: boolean | null;
}

export interface MatterEndpointView {
  id: string;
  nodeRef: string;
  endpointId: number;
  parentEndpointId: number | null;
  deviceTypes: { deviceTypeId: number; revision: number }[];
  profile: ProfileKey;
  metadata: Metadata;
  bridged: EndpointBridge | null;
  lastSeenAt: string;
  removedAt: string | null;
}

export interface MatterEndpointDetail extends MatterEndpointView {
  clusters: {
    clusterId: number;
    role: string;
    revision: number;
    featureMap: number;
    attributeIds: number[];
    acceptedCommandIds: number[];
  }[];
  capabilities: { capability: string; sourceClusterId: number; details: unknown }[];
}

/** Another administrator of the device: a fabric it is joined to. Read-only; Attraccess does not act for it. */
export interface NodeAdministrator {
  fabricIndex: number;
  vendorId: number | null;
  fabricLabel: string | null;
  isOwn: boolean;
}

export interface MatterNodeDetail extends MatterNodeSummary {
  /** Absent from an older backend. */
  administrators?: NodeAdministrator[];
  /** The device was commissioned although its attestation failed (a development override). */
  attestationOverridden?: boolean;
  fabric: { id: string; fabricId: string; status: string; label: string | null } | null;
  endpoints: MatterEndpointDetail[];
}

export interface StateEntry {
  stateKey: string;
  reported: { value: unknown; observedAt: string | null; receivedAt: string | null };
  freshness: 'fresh' | 'stale' | 'unknown';
  /** How long after `reported.observedAt` the entry turns stale. */
  staleAfterMs?: number;
  requested: { value: unknown; requestedAt: string | null };
  command: { state: string };
  confirmed: boolean;
  fault: { code: string; message: string; at: string } | null;
  uncertainActuation: boolean;
}

export interface ReconciliationStatus {
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastResult: 'applied' | 'skipped_unavailable' | 'skipped_non_authoritative' | 'failed' | null;
  lastSummary: { reason?: string; changeCount: number; nodesListed: number } | null;
  sidecarFabricId: string | null;
  events: Record<string, number>;
}

const api = createPluginApiClient('/api/matter');

export const listNodes = (includeInactive: boolean) =>
  api.request<MatterNodeSummary[]>('/nodes', { query: { includeInactive: includeInactive ? 'true' : undefined } });
export const getNode = (id: string) => api.request<MatterNodeDetail>(`/nodes/${encodeURIComponent(id)}`);
export const updateNode = (id: string, metadata: Partial<Metadata>) =>
  api.request<MatterNodeSummary>(`/nodes/${encodeURIComponent(id)}`, { method: 'PATCH', body: metadata });
export const updateEndpoint = (id: string, metadata: Partial<Metadata>) =>
  api.request<MatterEndpointView>(`/endpoints/${encodeURIComponent(id)}`, { method: 'PATCH', body: metadata });
export const getEndpointState = (id: string) =>
  api.request<{ endpointRef: string; states: StateEntry[] }>(`/endpoints/${encodeURIComponent(id)}/state`);

const action = <T = MatterNodeSummary>(id: string, name: string, body?: unknown) =>
  api.request<T>(`/nodes/${encodeURIComponent(id)}/${name}`, { method: 'POST', body: body ?? {} });
export const claimNode = (id: string, displayName?: string) => action(id, 'claim', displayName ? { displayName } : {});
export const repairNode = (id: string) => action(id, 'repair');
export const relinkNode = (id: string, sourceNodeId: string, confirmIdentityMismatch?: boolean) =>
  action(id, 'relink', { sourceNodeId, ...(confirmIdentityMismatch ? { confirmIdentityMismatch: true } : {}) });
export const archiveNode = (id: string) => action(id, 'archive');
export const restoreNode = (id: string) => action(id, 'restore');
export const forceRemoveNode = (id: string) => action(id, 'force-remove', { confirm: true });

/**
 * Removal from the fabric and sharing go through `matterRequest`, so a failure keeps the backend's `code` for the UI
 * to translate. The sharing codes come back once in the response body and are never part of a URL or a cache.
 */
export interface ShareWindow {
  manualCode: string;
  qrCode: string;
  expiresAt: string;
}
const nodePath = (id: string) => `/nodes/${encodeURIComponent(id)}`;
export const removeFromFabric = (id: string, mode: 'normal' | 'force') =>
  matterRequest<MatterNodeSummary>('POST', `${nodePath(id)}/remove`, { mode, confirm: true });
export const openShareWindow = (id: string, timeoutSec?: number) =>
  matterRequest<ShareWindow>('POST', `${nodePath(id)}/share`, timeoutSec === undefined ? {} : { timeoutSec });
export const closeShareWindow = (id: string) => matterRequest<{ closed: boolean }>('DELETE', `${nodePath(id)}/share`);

export const getReconciliation = () => api.request<ReconciliationStatus>('/reconciliation');
export const runReconciliation = () =>
  api.request<ReconciliationStatus>('/reconciliation', { method: 'POST', body: {} });
