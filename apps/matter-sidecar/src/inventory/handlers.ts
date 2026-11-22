import type { OperationResponse } from '@attraccess/matter-contract';
import type { ClientNode } from '@matter/main';
import type { FabricManager } from '../fabric/manager';
import type { FeatureHandlers } from '../request-pipeline';
import { commissionedPeers, findPeer, nodeIdOf, readAdministrators, requireController } from '../nodes/peers';
import { administratorsOf, describeNode, type Administrator, type EndpointLike, type InventoryNode } from './describe';
import { readAttestation } from './node-meta';

/** How long a list waits for one online device to report its fabrics. */
const ADMINISTRATORS_TIMEOUT_MS = 3_000;

type Observed = { administrators: Administrator[]; observedAt: string };

/**
 * The `inventory` operations: what the controller's commissioned peers look like, from the cache matter.js keeps. Only
 * the list of other administrators is read from the device (it is fabric-scoped, so the cache cannot hold it).
 */
export function inventoryHandlers(manager: FabricManager): FeatureHandlers {
  /** Last administrators and time a node answered, for nodes that are offline now. In memory only. */
  const lastObserved = new Map<string, Observed>();

  async function describe(peer: ClientNode, nodeId: string): Promise<InventoryNode> {
    const reachable = peer.lifecycle.isOnline;
    let observed = lastObserved.get(nodeId);
    if (reachable) {
      try {
        observed = {
          administrators: await readAdministrators(peer, ADMINISTRATORS_TIMEOUT_MS),
          observedAt: new Date().toISOString(),
        };
        lastObserved.set(nodeId, observed);
      } catch {
        // Keep the previous answer: a slow device must not fail the whole list.
      }
    }
    const cached = (peer.state as { operationalCredentials?: { fabrics?: unknown } }).operationalCredentials;
    return describeNode({
      nodeId,
      reachable,
      endpoints: [...peer.endpoints] as unknown as EndpointLike[],
      attestation: readAttestation(manager.layout, nodeId),
      administrators:
        observed?.administrators ?? administratorsOf(cached?.fabrics, peer.state.commissioning.fabricIndexOnPeer),
      observedAt: observed?.observedAt ?? null,
    });
  }

  async function list(): Promise<OperationResponse<'inventory.list'>> {
    const status = manager.status();
    if (status.state !== 'initialized') {
      // Without a controller the sidecar knows nothing: only "no fabric" is a complete answer.
      return { authoritative: status.state === 'uninitialized', fabricId: null, nodes: [] };
    }
    const controller = manager.controller;
    if (!controller?.running) return { authoritative: false, fabricId: status.fabricId, nodes: [] };
    const peers = commissionedPeers(controller);
    const nodes = await Promise.all(peers.map((peer) => describe(peer, nodeIdOf(peer) as string)));
    // A peer without cached basic information has not been interrogated yet, so its entry is incomplete.
    const complete = nodes.every((node) => node.vendorId !== null || node.productId !== null);
    return { authoritative: complete, fabricId: status.fabricId, nodes };
  }

  return {
    'inventory.list': list,
    'inventory.get': async ({ params }) => {
      const nodeId = (params as { nodeId: string }).nodeId;
      const peer = findPeer(requireController(manager), nodeId);
      return describe(peer, nodeId);
    },
  };
}
