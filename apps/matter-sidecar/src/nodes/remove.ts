import type { OperationResponse } from '@attraccess/matter-contract';
import { ApiError } from '../api-error';
import type { FabricManager } from '../fabric/manager';
import { forgetNodeMeta } from '../inventory/node-meta';
import {
  LATE_SETTLE_MS,
  findPeer,
  isStepTimeout,
  readAdministrators,
  requireController,
  runExclusiveWithEarlyReply,
  settleWithin,
  withTimeout,
} from './peers';

/** Proof that the device answers, before anything is sent that changes it. */
const PROBE_TIMEOUT_MS = 5_000;
/** RemoveFabric, and the matter.js clean-up that follows it. */
const DECOMMISSION_TIMEOUT_MS = 15_000;

type Removal = OperationResponse<'nodes.remove'>;

const uncertain = () =>
  new ApiError(
    'timeout',
    'The device did not confirm the removal in time. The outcome is uncertain: the removal may still complete. ' +
      'Check the device list before trying again.',
  );

/**
 * Removes a node from the Attraccess fabric.
 *
 * Normal: tell the reachable device to drop Attraccess's own fabric (RemoveFabric with our fabric index; other
 * administrators' fabrics are never touched), then forget the node here. If the device does not answer the probe,
 * nothing changes. RemoveFabric cannot be cancelled once sent: when it outlasts its step timeout or the request, the
 * caller hears `timeout` (outcome uncertain) at once, while the gate stays held until RemoveFabric settles (bounded). A
 * late confirmation is still committed: the node is forgotten and the fabric generation bumped (`fabric.changed`).
 *
 * Forced: forget the node here only. The device is not contacted and may keep its credentials for our fabric.
 */
export function removeNode(
  manager: FabricManager,
  nodeId: string,
  force: boolean,
  signal: AbortSignal,
): Promise<Removal> {
  return runExclusiveWithEarlyReply(manager, async (replyEarly) => {
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
      if (signal.aborted) throw new ApiError('timeout', 'The request deadline passed. Nothing was changed.');
      const decommission = peer.decommission();
      try {
        await withTimeout(decommission, DECOMMISSION_TIMEOUT_MS, signal);
      } catch (error) {
        if (!isStepTimeout(error)) {
          throw new ApiError('device_unreachable', 'The device did not confirm the removal. The node was kept.');
        }
        replyEarly(uncertain());
        const late = await settleWithin(decommission, LATE_SETTLE_MS);
        manager.logger('warn', 'a removal outlasted its deadline', { outcome: late.state });
        if (late.state !== 'fulfilled') throw uncertain();
      }
    }
    forgetNodeMeta(manager.layout, nodeId);
    const fabricGeneration = manager.commitFabricChange();
    return { nodeId, result: force ? 'forgotten' : 'removed_from_fabric', fabricGeneration } satisfies Removal;
  });
}
