import { ResourceFlowNode, Resource } from '@attraccess/database-entities';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';
import { requireRunMachineId } from './flow.utils';

/**
 * Records resource activity by stamping the shared resourceActivity map. The map
 * is owned by the executor service (also read by the inactivity cron), so it is
 * injected by reference.
 */
export class ActivityTrackExecutor implements NodeExecutor {
  constructor(private readonly resourceActivity: Map<Resource['id'], Date>) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    this.resourceActivity.set(await requireRunMachineId(node, ctx), new Date());

    return { payload: input };
  }
}
