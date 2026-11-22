import { Seconds, type ClientNode } from '@matter/main';
import { AdministratorCommissioning } from '@matter/main/clusters';
import { AdministratorCommissioningClient } from '@matter/main/behaviors';
import { StatusResponseError } from '@matter/main/types';
import type { OperationResponse } from '@attraccess/matter-contract';
import { ApiError } from '../api-error';
import type { FabricManager } from '../fabric/manager';
import {
  LATE_SETTLE_MS,
  findPeer,
  isStepTimeout,
  requireController,
  runExclusiveWithEarlyReply,
  settleWithin,
  withTimeout,
} from './peers';

const STEP_TIMEOUT_MS = 15_000;

const unreachable = (error: unknown) =>
  isStepTimeout(error)
    ? new ApiError('timeout', 'The device did not answer in time.')
    : new ApiError('device_unreachable', 'The device did not answer.');

const revoke = (peer: ClientNode) =>
  Promise.resolve(peer.act((agent) => agent.get(AdministratorCommissioningClient).revokeCommissioning()));

/**
 * Opens an Enhanced Commissioning Window so another ecosystem can add the device. The returned codes are secrets: they
 * go to the caller once and are neither stored nor logged here.
 *
 * The open cannot be cancelled once sent. When it outlasts its step timeout or the request, the caller hears `timeout`
 * at once, while the gate stays held until the open settles (bounded). A window that opened late is closed again: its
 * codes never reached anyone.
 */
export function openShareWindow(
  manager: FabricManager,
  nodeId: string,
  timeoutSec: number,
  signal: AbortSignal,
): Promise<OperationResponse<'nodes.share.open'>> {
  return runExclusiveWithEarlyReply(manager, async (replyEarly) => {
    const peer = findPeer(requireController(manager), nodeId);
    if (signal.aborted) throw new ApiError('timeout', 'The request deadline passed. Nothing was changed.');
    const opening = peer.openEnhancedCommissioningWindow(Seconds(timeoutSec));
    let window;
    try {
      window = await withTimeout(opening, STEP_TIMEOUT_MS, signal);
    } catch (error) {
      if (!isStepTimeout(error)) throw unreachable(error);
      replyEarly(unreachable(error));
      const late = await settleWithin(opening, LATE_SETTLE_MS);
      if (late.state === 'fulfilled') {
        // Nobody holds these codes, so the window serves no one: close it.
        const closed = await settleWithin(revoke(peer), STEP_TIMEOUT_MS);
        manager.logger('warn', 'a commissioning window opened after its deadline', { closed: closed.state });
      }
      throw unreachable(error);
    }
    return {
      nodeId,
      manualCode: window.manualPairingCode,
      qrCode: window.qrPairingCode,
      expiresAt: new Date(Date.now() + timeoutSec * 1000).toISOString(),
    };
  });
}

/** RevokeCommissioning. `closed` is false when the device had no window open. */
export function closeShareWindow(
  manager: FabricManager,
  nodeId: string,
  signal: AbortSignal,
): Promise<OperationResponse<'nodes.share.revoke'>> {
  return runExclusiveWithEarlyReply(manager, async (replyEarly) => {
    const peer = findPeer(requireController(manager), nodeId);
    const revoking = revoke(peer);
    try {
      await withTimeout(revoking, STEP_TIMEOUT_MS, signal);
      return { nodeId, closed: true };
    } catch (error) {
      const notOpen =
        StatusResponseError.is(error, 1) &&
        StatusResponseError.of(error)?.clusterCode === AdministratorCommissioning.StatusCode.WindowNotOpen;
      if (notOpen) return { nodeId, closed: false };
      if (isStepTimeout(error)) {
        // Like an open, a revoke on its way to the device holds the gate until it settles.
        replyEarly(unreachable(error));
        await settleWithin(revoking, LATE_SETTLE_MS);
      }
      throw unreachable(error);
    }
  });
}
