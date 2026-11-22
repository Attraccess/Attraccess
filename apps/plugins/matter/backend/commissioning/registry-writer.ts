// Creates the registry rows of a freshly commissioned node, in the caller's transaction. Only called after the sidecar
// reported success and the plugin read the node itself (decision 10).
import { randomUUID } from 'node:crypto';
import type { MatterEndpoint, MatterNode } from '../devices/entities';
import type { NodeView } from '../devices/sidecar-types';
import { findLive, identityOf, newCounters, syncNode } from '../devices/sync';
import type { MatterTables } from '../plugin-storage/access';

export class RegistryConflictError extends Error {}

export type RegisteredNode = { node: MatterNode; endpoints: MatterEndpoint[] };

/**
 * The node as `claimed` by the commissioning user, with its endpoints, clusters and capabilities. A node a
 * reconciliation quarantined in the meantime (unclaimed) is claimed instead of duplicated. A live node in any other
 * state, or in another fabric, is a conflict: the caller ends the session as `needs_reconciliation`.
 */
export async function registerCommissionedNode(
  tables: MatterTables,
  input: { fabricId: string; view: NodeView; userId: number; overridden: boolean; now: string },
): Promise<RegisteredNode> {
  const { fabricId, view, userId, overridden, now } = input;
  let fabric = await tables.fabrics.findOne({ where: { fabricId, retiredAt: null } });
  if (!fabric) {
    fabric = await tables.fabrics.insert({
      id: randomUUID(),
      fabricId,
      label: null,
      firstSeenAt: now,
      lastSeenAt: now,
      status: 'active',
      retiredAt: null,
      fabricGeneration: null,
      storageInstanceId: null,
      rootCertFingerprint: null,
      recordedAt: null,
    });
  } else if (fabric.status !== 'active') {
    throw new RegistryConflictError('The fabric is not the active one.');
  }
  const attestation = {
    attestationStatus: overridden ? ('unverified' as const) : view.attestation.status,
    attestationOverridden: overridden,
  };
  const live = (await findLive(tables.nodes, 'fabricRef', fabric.id)).find((entry) => entry.nodeId === view.nodeId);
  let node: MatterNode;
  if (live) {
    if (live.lifecycleState !== 'unclaimed') throw new RegistryConflictError('The node already has a record.');
    const patch = {
      lifecycleState: 'claimed' as const,
      claimedAt: now,
      claimedBy: userId,
      updatedAt: now,
      ...attestation,
    };
    const changed = await tables.nodes.update({ id: live.id, lifecycleState: 'unclaimed' }, patch);
    if (changed === 0) throw new RegistryConflictError('The node changed in the meantime.');
    node = Object.assign(live, patch);
  } else {
    node = {
      id: randomUUID(),
      fabricRef: fabric.id,
      nodeId: view.nodeId,
      displayName: null,
      description: null,
      location: null,
      lifecycleState: 'claimed',
      detachedReason: null,
      firstSeenAt: now,
      claimedAt: now,
      claimedBy: userId,
      detachedAt: null,
      archivedAt: null,
      archivedBy: null,
      removedAt: null,
      removedBy: null,
      removalReason: null,
      mergedInto: null,
      createdAt: now,
      updatedAt: now,
      ...identityOf(view, now),
      ...attestation,
    };
    await tables.nodes.insert(node);
  }
  await syncNode(tables, node, view, now, newCounters());
  // syncNode refreshes the identity from the sidecar's view, whose attestation may read `verified` or `failed`: the
  // outcome of this attempt stays what the sidecar decided about it.
  if (overridden && node.attestationStatus !== 'unverified') {
    node.attestationStatus = 'unverified';
    await tables.nodes.update({ id: node.id }, { attestationStatus: 'unverified' });
  }
  const endpoints = await findLive(tables.endpoints, 'nodeRef', node.id);
  endpoints.sort((a, b) => a.endpointId - b.endpointId);
  return { node, endpoints };
}
