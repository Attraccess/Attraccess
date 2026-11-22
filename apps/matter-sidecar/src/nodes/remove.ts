import type { OperationResponse } from '@attraccess/matter-contract';
import { ApiError } from '../api-error';
import type { FabricManager } from '../fabric/manager';
import { forgetNodeMeta } from '../inventory/node-meta';
import { findPeer, isStepTimeout, readAdministrators, requireController, withTimeout } from './peers';

/** Proof that the device answers, before anything is sent that changes it. */
const PROBE_TIMEOUT_MS = 5_000;
/** RemoveFabric, and the matter.js clean-up that follows it. */
const DECOMMISSION_TIMEOUT_MS = 15_000;

type Removal = OperationResponse<'nodes.remove'>;

/**
 * Removes a node from the Attraccess fabric.
 *
 * Normal: tell the reachable device to drop Attraccess's own fabric (RemoveFabric with our fabric index; other
 * administrators' fabrics are never touched), then forget the node here. If the device does not answer, nothing changes.
 *
 * Forced: forget the node here only. The device is not contacted and may keep its credentials for our fabric.
 */
export function removeNode(
  manager: FabricManager,
  nodeId: string,
  force: boolean,
  signal: AbortSignal,
): Promise<Removal> {
  return manager.runExclusive(async () => {
    const controller = requireController(manager);
    const peer = findPeer(controller, nodeId);
    if (force) {
      await peer.delete();
    } else {
      try {
        await readAdministrators(peer, PROBE_TIMEOUT_MS, signal);
      } catch {
        throw new ApiError('device_unreachable', 'The device did not answer. Nothing was changed.');
      }
      try {
        await withTimeout(peer.decommission(), DECOMMISSION_TIMEOUT_MS, signal);
      } catch (error) {
        throw isStepTimeout(error)
          ? new ApiError('timeout', 'The device did not confirm the removal in time. The node was kept.')
          : new ApiError('device_unreachable', 'The device did not confirm the removal. The node was kept.');
      }
    }
    forgetNodeMeta(manager.layout, nodeId);
    const fabricGeneration = manager.commitFabricChange();
    return { nodeId, result: force ? 'forgotten' : 'removed_from_fabric', fabricGeneration } satisfies Removal;
  });
}
