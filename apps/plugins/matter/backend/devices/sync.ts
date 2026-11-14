// Applies one sidecar node view to the plugin's rows: protocol identity, endpoints, clusters and capabilities.
// Used by reconciliation, repair and relink. Only protocol-owned columns are written: editable names, descriptions
// and locations never. Nothing is deleted; vanished endpoints and clusters get `removed_at`.
import type { NodeView } from './sidecar-types';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import {
  MatterEndpoint,
  MatterEndpointCapability,
  MatterEndpointCluster,
  MatterNode,
  type EndpointRemovalReason,
  type LifecycleState,
} from './entities';
import { deriveCapabilities, deriveProfile } from './profile';

export type Counters = {
  fabricsChanged: number;
  nodesQuarantined: number;
  nodesDetached: number;
  nodesReattached: number;
  nodesUpdated: number;
  endpointsAdded: number;
  endpointsUpdated: number;
  endpointsRemoved: number;
  endpointsReplaced: number;
  clustersChanged: number;
};
/** Things seen but deliberately not acted on. They are not changes. */
export type Observations = { archivedReappeared: number; mismatchedStillListed: number };

export const newCounters = (): Counters => ({
  fabricsChanged: 0,
  nodesQuarantined: 0,
  nodesDetached: 0,
  nodesReattached: 0,
  nodesUpdated: 0,
  endpointsAdded: 0,
  endpointsUpdated: 0,
  endpointsRemoved: 0,
  endpointsReplaced: 0,
  clustersChanged: 0,
});
export const newObservations = (): Observations => ({ archivedReappeared: 0, mismatchedStillListed: 0 });
export const totalChanges = (counters: Counters): number => Object.values(counters).reduce((sum, n) => sum + n, 0);

/** The node columns the sidecar owns. Reconciliation, repair and relink write these and nothing else of a node. */
export const NODE_IDENTITY_COLUMNS = [
  'vendorId',
  'productId',
  'vendorName',
  'productName',
  'serialNumber',
  'uniqueId',
  'hardwareVersion',
  'softwareVersion',
  'softwareVersionString',
  'attestationStatus',
  'attestationCheckedAt',
  'reachable',
  'lastSeenAt',
] as const satisfies readonly (keyof MatterNode)[];

/** The endpoint columns the sidecar owns. */
export const ENDPOINT_PROTOCOL_COLUMNS = [
  'parentEndpointId',
  'deviceTypes',
  'profile',
  'bridged',
  'bridgedUniqueId',
  'bridgedNodeLabel',
  'bridgedVendorName',
  'bridgedProductName',
  'bridgedSerialNumber',
  'bridgedReachable',
  'lastSeenAt',
] as const satisfies readonly (keyof MatterEndpoint)[];

/** Rows of `entity` whose `column` equals `value` and that are not removed. */
export function findLive<T extends { removedAt: string | null }>(
  manager: EntityManager,
  entity: new () => T,
  column: keyof T & string,
  value: string,
): Promise<T[]> {
  return manager
    .createQueryBuilder(entity, 'e')
    .where(`e.${column} = :value AND e.removedAt IS NULL`, { value })
    .getMany();
}

/** The state a detached node returns to when it is attached again: claimed if it ever was, unclaimed otherwise. */
export const reattachedState = (node: MatterNode): Extract<LifecycleState, 'claimed' | 'unclaimed'> =>
  node.claimedAt ? 'claimed' : 'unclaimed';

const sorted = (ids: readonly number[]) => JSON.stringify([...ids].sort((a, b) => a - b));

/** The protocol identity columns for a sidecar node. `lastSeenAt` is the sidecar's own observation time. */
export function identityOf(
  view: NodeView,
  fallbackLastSeen: string,
): Pick<MatterNode, (typeof NODE_IDENTITY_COLUMNS)[number]> {
  return {
    vendorId: view.vendorId,
    productId: view.productId,
    vendorName: view.vendorName,
    productName: view.productName,
    serialNumber: view.serialNumber,
    uniqueId: view.uniqueId,
    hardwareVersion: view.hardwareVersion,
    softwareVersion: view.softwareVersion,
    softwareVersionString: view.softwareVersionString,
    attestationStatus: view.attestation.status,
    attestationCheckedAt: view.attestation.checkedAt,
    reachable: view.reachable,
    lastSeenAt: view.observedAt ?? fallbackLastSeen,
  };
}

/** Assigns only differing values; returns the changed ones, or null when nothing changed. */
export function assignChanged<T extends object>(target: T, patch: Partial<T>): Partial<T> | null {
  const changed: Partial<T> = {};
  let any = false;
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (target[key] !== patch[key]) {
      target[key] = patch[key] as T[keyof T];
      changed[key] = patch[key];
      any = true;
    }
  }
  return any ? changed : null;
}

/**
 * Retires an endpoint: the row and its clusters stay as history, marked removed. Capabilities are derived data and
 * are dropped. The state rows stay, so the state of a retired endpoint can still be read.
 */
export async function retireEndpoint(
  manager: EntityManager,
  endpoint: MatterEndpoint,
  reason: EndpointRemovalReason,
  now: string,
): Promise<void> {
  endpoint.removedAt = now;
  endpoint.removalReason = reason;
  await manager.update(MatterEndpoint, { id: endpoint.id }, { removedAt: now, removalReason: reason });
  await manager
    .createQueryBuilder()
    .update(MatterEndpointCluster)
    .set({ removedAt: now })
    .where('endpoint_ref = :endpointRef AND removed_at IS NULL', { endpointRef: endpoint.id })
    .execute();
  await manager.delete(MatterEndpointCapability, { endpointRef: endpoint.id });
}

/** Refreshes a node's identity and its endpoint tree from `view`. */
export async function syncNode(
  manager: EntityManager,
  node: MatterNode,
  view: NodeView,
  now: string,
  counters: Counters,
): Promise<void> {
  const changed = assignChanged(node, identityOf(view, node.lastSeenAt));
  if (changed) {
    node.updatedAt = now;
    await manager.update(MatterNode, { id: node.id }, { ...changed, updatedAt: now });
    counters.nodesUpdated += 1;
  }
  await syncEndpoints(manager, node, view, now, counters);
}

function endpointPatch(
  view: NodeView['endpoints'][number],
  previous: MatterEndpoint | null,
  seenAt: string,
): Partial<MatterEndpoint> {
  const clusters = view.clusters.map((cluster) => ({
    clusterId: cluster.clusterId,
    role: cluster.role,
    featureMap: cluster.featureMap,
  }));
  const capabilities = deriveCapabilities(clusters);
  const types = [...view.deviceTypes].sort((a, b) => a.deviceTypeId - b.deviceTypeId);
  const bridged = view.bridged;
  return {
    parentEndpointId: view.parentEndpointId,
    deviceTypes: JSON.stringify(types),
    profile: deriveProfile(
      capabilities,
      types.map((type) => type.deviceTypeId),
    ),
    bridged: bridged !== null,
    // A bridge that momentarily omits the unique ID must not blank the one that identifies the hardware.
    bridgedUniqueId: bridged ? (bridged.uniqueId ?? previous?.bridgedUniqueId ?? null) : null,
    bridgedNodeLabel: bridged?.nodeLabel ?? null,
    bridgedVendorName: bridged?.vendorName ?? null,
    bridgedProductName: bridged?.productName ?? null,
    bridgedSerialNumber: bridged?.serialNumber ?? null,
    bridgedReachable: bridged?.reachable ?? null,
    lastSeenAt: seenAt,
  };
}

/** The first entry per key: a sidecar that lists an ID twice must not break the live-uniqueness indexes. */
function uniqueBy<T>(items: readonly T[], key: (item: T) => string | number): T[] {
  const seen = new Set<string | number>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function syncEndpoints(
  manager: EntityManager,
  node: MatterNode,
  view: NodeView,
  now: string,
  counters: Counters,
): Promise<void> {
  const live = await findLive(manager, MatterEndpoint, 'nodeRef', node.id);
  const liveById = new Map(live.map((row) => [row.endpointId, row]));
  const seen = new Set<number>();
  // The sidecar's observation time, like the node's `lastSeenAt`: reruns on the same answer change nothing.
  const seenAt = view.observedAt;

  for (const endpoint of uniqueBy(view.endpoints, (entry) => entry.endpointId)) {
    seen.add(endpoint.endpointId);
    let row = liveById.get(endpoint.endpointId) ?? null;
    const newUniqueId = endpoint.bridged?.uniqueId ?? null;
    if (row && row.bridgedUniqueId !== null && newUniqueId !== null && row.bridgedUniqueId !== newUniqueId) {
      // Other hardware behind the same endpoint ID: a flow reference must never silently follow it.
      await retireEndpoint(manager, row, 'replaced', now);
      counters.endpointsReplaced += 1;
      row = null;
    }
    if (!row) {
      row = manager.create(MatterEndpoint, {
        id: randomUUID(),
        nodeRef: node.id,
        endpointId: endpoint.endpointId,
        displayName: null,
        description: null,
        location: null,
        firstSeenAt: now,
        removedAt: null,
        removalReason: null,
        ...endpointPatch(endpoint, null, seenAt ?? now),
      });
      await manager.insert(MatterEndpoint, row);
      counters.endpointsAdded += 1;
    } else {
      const changed = assignChanged(row, endpointPatch(endpoint, row, seenAt ?? row.lastSeenAt));
      if (changed) {
        await manager.update(MatterEndpoint, { id: row.id }, changed);
        counters.endpointsUpdated += 1;
      }
    }
    await syncClusters(manager, row, endpoint, now, counters);
  }

  for (const row of live) {
    if (seen.has(row.endpointId) || row.removedAt !== null) continue;
    await retireEndpoint(manager, row, 'absent_from_sidecar', now);
    counters.endpointsRemoved += 1;
  }
}

async function syncClusters(
  manager: EntityManager,
  endpoint: MatterEndpoint,
  view: NodeView['endpoints'][number],
  now: string,
  counters: Counters,
): Promise<void> {
  const live = await findLive(manager, MatterEndpointCluster, 'endpointRef', endpoint.id);
  const key = (clusterId: number, role: string) => `${clusterId}:${role}`;
  const liveByKey = new Map(live.map((row) => [key(row.clusterId, row.role), row]));
  const clusters = uniqueBy(view.clusters, (cluster) => key(cluster.clusterId, cluster.role));
  const seen = new Set<string>();

  const added: MatterEndpointCluster[] = [];
  for (const cluster of clusters) {
    const k = key(cluster.clusterId, cluster.role);
    seen.add(k);
    const patch: Partial<MatterEndpointCluster> = {
      revision: cluster.revision,
      featureMap: cluster.featureMap,
      attributeIds: sorted(cluster.attributeIds),
      acceptedCommandIds: sorted(cluster.acceptedCommandIds),
    };
    const row = liveByKey.get(k);
    if (!row) {
      added.push(
        manager.create(MatterEndpointCluster, {
          id: randomUUID(),
          endpointRef: endpoint.id,
          clusterId: cluster.clusterId,
          role: cluster.role,
          removedAt: null,
          ...patch,
        }),
      );
      counters.clustersChanged += 1;
      continue;
    }
    const changed = assignChanged(row, patch);
    if (changed) {
      await manager.update(MatterEndpointCluster, { id: row.id }, changed);
      counters.clustersChanged += 1;
    }
  }
  // In chunks: an endpoint may list up to 128 clusters, and SQLite limits the bound variables per statement.
  for (let start = 0; start < added.length; start += 50) {
    await manager.insert(MatterEndpointCluster, added.slice(start, start + 50));
  }
  for (const row of live) {
    if (seen.has(key(row.clusterId, row.role))) continue;
    row.removedAt = now;
    await manager.update(MatterEndpointCluster, { id: row.id }, { removedAt: now });
    counters.clustersChanged += 1;
  }
  await syncCapabilities(manager, endpoint.id, clusters);
}

async function syncCapabilities(
  manager: EntityManager,
  endpointRef: string,
  clusters: NodeView['endpoints'][number]['clusters'],
): Promise<void> {
  const wanted = deriveCapabilities(
    clusters.map((cluster) => ({
      clusterId: cluster.clusterId,
      role: cluster.role,
      featureMap: cluster.featureMap ?? null,
    })),
  );
  const existing = new Map(
    (await manager.findBy(MatterEndpointCapability, { endpointRef })).map((row) => [row.capability, row]),
  );
  const added: MatterEndpointCapability[] = [];
  for (const capability of wanted) {
    const details = JSON.stringify(capability.details);
    const row = existing.get(capability.capability);
    if (!row) {
      added.push(
        manager.create(MatterEndpointCapability, {
          id: randomUUID(),
          endpointRef,
          capability: capability.capability,
          sourceClusterId: capability.sourceClusterId,
          details,
        }),
      );
    } else if (row.sourceClusterId !== capability.sourceClusterId || row.details !== details) {
      await manager.update(
        MatterEndpointCapability,
        { id: row.id },
        { sourceClusterId: capability.sourceClusterId, details },
      );
    }
    existing.delete(capability.capability);
  }
  if (added.length > 0) await manager.insert(MatterEndpointCapability, added);
  // Capabilities are derived on every sync, so one that no longer follows from the clusters is just dropped.
  for (const row of existing.values()) await manager.delete(MatterEndpointCapability, { id: row.id });
}
