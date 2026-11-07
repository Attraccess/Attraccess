import { Logger } from '@nestjs/common';
import {
  ResourceFlowNode,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSource,
  ResourceHealthStatus,
} from '@attraccess/database-entities';
import { ResourceHealthService } from '../../health/resource-health.service';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';
import { heartbeatKey, requireRunResourceId } from './flow.utils';

/**
 * Records a heartbeat from an output node: stamps the shared last-seen map and
 * reports HEALTHY. The last-seen map is owned by the executor service (also used
 * by the heartbeat-timeout cron), so it is injected by reference.
 */
export class HealthHeartbeatExecutor implements NodeExecutor {
  private readonly logger = new Logger(HealthHeartbeatExecutor.name);

  constructor(
    private readonly resourceHealthService: ResourceHealthService,
    private readonly heartbeatLastSeen: Map<string, Date>,
  ) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const parsed = ResourceHealthHeartbeatNodeDataSchema.safeParse(node.data ?? {});
    if (!parsed.success) {
      this.logger.warn(`Heartbeat node ${node.id} has invalid data: ${parsed.error.message}`);
      return { payload: input };
    }
    const normalizedIdentifier = (parsed.data.identifier ?? '').trim();
    const resourceId = requireRunResourceId(node, ctx);
    const now = new Date();

    this.heartbeatLastSeen.set(heartbeatKey(resourceId, normalizedIdentifier), now);

    await this.resourceHealthService.reportHealth({
      resourceId: resourceId,
      identifier: normalizedIdentifier,
      status: ResourceHealthStatus.HEALTHY,
      reason: null,
      source: ResourceHealthSource.HEARTBEAT,
      reportedAt: now,
    });

    return { payload: input };
  }
}
