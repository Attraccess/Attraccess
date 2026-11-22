import { Seconds } from '@matter/main';
import { AdministratorCommissioning } from '@matter/main/clusters';
import { AdministratorCommissioningClient } from '@matter/main/behaviors';
import { StatusResponseError } from '@matter/main/types';
import type { OperationResponse } from '@attraccess/matter-contract';
import { ApiError } from '../api-error';
import type { FabricManager } from '../fabric/manager';
import { findPeer, isStepTimeout, requireController, withTimeout } from './peers';

const STEP_TIMEOUT_MS = 15_000;

const unreachable = (error: unknown) =>
  isStepTimeout(error)
    ? new ApiError('timeout', 'The device did not answer in time.')
    : new ApiError('device_unreachable', 'The device did not answer.');

/**
 * Opens an Enhanced Commissioning Window so another ecosystem can add the device. The returned codes are secrets: they
 * go to the caller once and are neither stored nor logged here.
 */
export function openShareWindow(
  manager: FabricManager,
  nodeId: string,
  timeoutSec: number,
  signal: AbortSignal,
): Promise<OperationResponse<'nodes.share.open'>> {
  return manager.runExclusive(async () => {
    const peer = findPeer(requireController(manager), nodeId);
    let window;
    try {
      window = await withTimeout(peer.openEnhancedCommissioningWindow(Seconds(timeoutSec)), STEP_TIMEOUT_MS, signal);
    } catch (error) {
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
  return manager.runExclusive(async () => {
    const peer = findPeer(requireController(manager), nodeId);
    try {
      await withTimeout(
        Promise.resolve(peer.act((agent) => agent.get(AdministratorCommissioningClient).revokeCommissioning())),
        STEP_TIMEOUT_MS,
        signal,
      );
      return { nodeId, closed: true };
    } catch (error) {
      const notOpen =
        StatusResponseError.is(error, 1) &&
        StatusResponseError.of(error)?.clusterCode === AdministratorCommissioning.StatusCode.WindowNotOpen;
      if (notOpen) return { nodeId, closed: false };
      throw unreachable(error);
    }
  });
}
