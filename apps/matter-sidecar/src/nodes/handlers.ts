import type { FabricManager } from '../fabric/manager';
import type { FeatureHandlers } from '../request-pipeline';
import { removeNode } from './remove';
import { closeShareWindow, openShareWindow } from './share';

type NodeParams = { nodeId: string };

/** The node-level fabric operations: removal and sharing with another controller. */
export function nodeHandlers(manager: FabricManager): FeatureHandlers {
  return {
    'nodes.remove': ({ params, body, signal }) =>
      removeNode(manager, (params as NodeParams).nodeId, (body as { force: boolean }).force, signal),
    'nodes.share.open': ({ params, body, signal }) =>
      openShareWindow(manager, (params as NodeParams).nodeId, (body as { timeoutSec: number }).timeoutSec, signal),
    'nodes.share.revoke': ({ params, signal }) => closeShareWindow(manager, (params as NodeParams).nodeId, signal),
  };
}
