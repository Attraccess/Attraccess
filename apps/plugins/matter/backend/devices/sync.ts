// Applies one sidecar node view to the plugin's rows: protocol identity, endpoints, clusters and capabilities.
// Used by reconciliation, repair and relink. Only protocol-owned columns are written: editable names, descriptions
// and locations never. Nothing is deleted; vanished endpoints and clusters get `removed_at`.
import type { NodeView } from './sidecar-types';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { MatterEndpoint, MatterEndpointCapability, MatterEndpointCluster, MatterNode } from './entities';
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

const sorted = (ids: readonly number[]) => JSON.stringify([...ids].sort((a, b) => a - b));

/** The protocol identity columns for a sidecar node. `lastSeenAt` is the sidecar's own observation time. */
export function identityOf(view: NodeView, fallbackLastSeen: string): Partial<MatterNode> {
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

/** Assigns only differing values; returns whether anything changed. */
export function assignChanged<T extends object>(target: T, patch: Partial<T>): boolean {
  let changed = false;
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (target[key] !== patch[key]) {
      target[key] = patch[key] as T[keyof T];
      changed = true;
    }
  }
  return changed;
}

/** Refreshes a node's identity and its endpoint tree from `view`. */
export async function syncNode(
  manager: EntityManager,
  node: MatterNode,
  view: NodeView,
  now: string,
  counters: Counters,
): Promise<void> {
  if (assignChanged(node, identityOf(view, node.lastSeenAt))) {
    node.updatedAt = now;
    await manager.save(MatterNode, node);
    counters.nodesUpdated += 1;
  }
  await syncEndpoints(manager, node, view, now, counters);
}

function endpointPatch(view: NodeView['endpoints'][number], previous: MatterEndpoint | null): Partial<MatterEndpoint> {
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
  };
}

async function syncEndpoints(
  manager: EntityManager,
  node: MatterNode,
  view: NodeView,
  now: string,
  counters: Counters,
): Promise<void> {
  const repo = manager.getRepository(MatterEndpoint);
  const live = await findLive(manager, MatterEndpoint, 'nodeRef', node.id);
  const liveById = new Map(live.map((row) => [row.endpointId, row]));
  const seen = new Set<number>();

  for (const endpoint of view.endpoints) {
    seen.add(endpoint.endpointId);
    let row = liveById.get(endpoint.endpointId) ?? null;
    const newUniqueId = endpoint.bridged?.uniqueId ?? null;
    if (row && row.bridgedUniqueId !== null && newUniqueId !== null && row.bridgedUniqueId !== newUniqueId) {
      // Other hardware behind the same endpoint ID: a flow reference must never silently follow it.
      row.removedAt = now;
      row.removalReason = 'replaced';
      await repo.save(row);
      await retireChildren(manager, row.id, now);
      counters.endpointsReplaced += 1;
      row = null;
    }
    if (!row) {
      row = repo.create({
        id: randomUUID(),
        nodeRef: node.id,
        endpointId: endpoint.endpointId,
        displayName: null,
        description: null,
        location: null,
        firstSeenAt: now,
        lastSeenAt: now,
        removedAt: null,
        removalReason: null,
        ...endpointPatch(endpoint, null),
      } as MatterEndpoint);
      await repo.save(row);
      counters.endpointsAdded += 1;
    } else if (assignChanged(row, endpointPatch(endpoint, row))) {
      await repo.save(row);
      counters.endpointsUpdated += 1;
    }
    await syncClusters(manager, row, endpoint, now, counters);
  }

  for (const row of live) {
    if (seen.has(row.endpointId) || row.removedAt !== null) continue;
    row.removedAt = now;
    row.removalReason = 'absent_from_sidecar';
    await repo.save(row);
    await retireChildren(manager, row.id, now);
    counters.endpointsRemoved += 1;
  }
}

/** A retired endpoint keeps its cluster rows as history, marked removed. Its capabilities are derived data. */
async function retireChildren(manager: EntityManager, endpointRef: string, now: string): Promise<void> {
  await manager
    .createQueryBuilder()
    .update(MatterEndpointCluster)
    .set({ removedAt: now })
    .where('endpoint_ref = :endpointRef AND removed_at IS NULL', { endpointRef })
    .execute();
  await manager.delete(MatterEndpointCapability, { endpointRef });
}

async function syncClusters(
  manager: EntityManager,
  endpoint: MatterEndpoint,
  view: NodeView['endpoints'][number],
  now: string,
  counters: Counters,
): Promise<void> {
  const repo = manager.getRepository(MatterEndpointCluster);
  const live = await findLive(manager, MatterEndpointCluster, 'endpointRef', endpoint.id);
  const key = (clusterId: number, role: string) => `${clusterId}:${role}`;
  const liveByKey = new Map(live.map((row) => [key(row.clusterId, row.role), row]));
  const seen = new Set<string>();

  for (const cluster of view.clusters) {
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
      await repo.save(
        repo.create({
          id: randomUUID(),
          endpointRef: endpoint.id,
          clusterId: cluster.clusterId,
          role: cluster.role,
          removedAt: null,
          ...patch,
        } as MatterEndpointCluster),
      );
      counters.clustersChanged += 1;
    } else if (assignChanged(row, patch)) {
      await repo.save(row);
      counters.clustersChanged += 1;
    }
  }
  for (const row of live) {
    if (seen.has(key(row.clusterId, row.role))) continue;
    row.removedAt = now;
    await repo.save(row);
    counters.clustersChanged += 1;
  }
  await syncCapabilities(manager, endpoint.id, view);
}

async function syncCapabilities(
  manager: EntityManager,
  endpointRef: string,
  view: NodeView['endpoints'][number],
): Promise<void> {
  const repo = manager.getRepository(MatterEndpointCapability);
  const wanted = deriveCapabilities(
    view.clusters.map((cluster) => ({
      clusterId: cluster.clusterId,
      role: cluster.role,
      featureMap: cluster.featureMap ?? null,
    })),
  );
  const existing = new Map((await repo.findBy({ endpointRef })).map((row) => [row.capability, row]));
  for (const capability of wanted) {
    const details = JSON.stringify(capability.details);
    const row = existing.get(capability.capability);
    if (!row) {
      await repo.save(
        repo.create({
          id: randomUUID(),
          endpointRef,
          capability: capability.capability,
          sourceClusterId: capability.sourceClusterId,
          details,
        }),
      );
    } else if (row.sourceClusterId !== capability.sourceClusterId || row.details !== details) {
      row.sourceClusterId = capability.sourceClusterId;
      row.details = details;
      await repo.save(row);
    }
    existing.delete(capability.capability);
  }
  // Capabilities are derived on every sync, so one that no longer follows from the clusters is just dropped.
  for (const row of existing.values()) await repo.delete({ id: row.id });
}
