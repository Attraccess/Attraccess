import { ResourceFlowNode, Resource } from '@attraccess/database-entities';
import { NodeExecutor, NodeProcessingResult } from './node-executor.interface';

/**
 * Records resource activity by stamping the shared resourceActivity map. The map
 * is owned by the executor service (also read by the inactivity cron), so it is
 * injected by reference.
 */
export class ActivityTrackExecutor implements NodeExecutor {
  constructor(private readonly resourceActivity: Map<Resource['id'], Date>) {}

  async execute(node: ResourceFlowNode, input: object): Promise<NodeProcessingResult> {
    this.resourceActivity.set(node.resourceId, new Date());

    return { payload: input };
  }
}
