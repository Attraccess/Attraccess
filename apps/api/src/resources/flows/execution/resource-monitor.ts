import { Logger } from '@nestjs/common';
import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceUsage,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSource,
  ResourceHealthStatus,
  InputResourceActivityNoActivityNodeDataSchema,
} from '@attraccess/database-entities';
import { IsNull, Repository } from 'typeorm';
import { ResourceHealthService } from '../../health/resource-health.service';
import { CronTimer } from '../../../metrics/instrumentation/cron/cron.helper';
import { NodeProcessingResult, heartbeatKey } from '../node-executors';
import { FlowExecutionOptions } from './flow-execution.types';
import { activeUsageSql } from '../../usage/sessions/active-usage';
import { enabledGlobalNodesWhere } from './flow-node-queries';

/** Minute-based activity triggers and heartbeat expiry share the executor's live state. */
export class FlowResourceMonitor {
  constructor(
    private readonly flowNodeRepository: Repository<ResourceFlowNode>,
    private readonly resourceActivity: Map<number, Date>,
    private readonly heartbeatLastSeen: Map<string, Date>,
    private readonly resourceHealthService: ResourceHealthService,
    private readonly cronTimer: CronTimer,
    private readonly startFlow: (
      node: ResourceFlowNode,
      data: NodeProcessingResult,
      options?: FlowExecutionOptions,
    ) => Promise<NodeProcessingResult[]>,
    private readonly logger: Logger,
  ) {}

  /** When a no-activity node last fired for a resource; every (node, resource) pair keeps its own schedule. */
  private readonly noActivityFiredAt = new Map<string, Date>();

  private async heartbeatNodes() {
    return this.flowNodeRepository.find({
      where: [
        { type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT, flowId: IsNull() },
        enabledGlobalNodesWhere(ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT),
      ],
    });
  }

  public async checkHealthHeartbeats() {
    const heartbeatNodes = await this.heartbeatNodes();

    // A global heartbeat node tracks every resource that has beaten through it, so its identifiers match any resource.
    const globalIdentifiers = new Set<string>();
    const validKeys = new Set<string>();
    for (const node of heartbeatNodes) {
      const parsed = ResourceHealthHeartbeatNodeDataSchema.safeParse(node.data ?? {});
      if (!parsed.success) {
        continue;
      }
      const identifier = (parsed.data.identifier ?? '').trim();
      if (node.resourceId === null) {
        globalIdentifiers.add(identifier);
      } else {
        validKeys.add(heartbeatKey(node.resourceId, identifier));
      }
    }

    for (const key of this.heartbeatLastSeen.keys()) {
      if (!validKeys.has(key) && !globalIdentifiers.has(identifierOfHeartbeatKey(key))) {
        this.heartbeatLastSeen.delete(key);
      }
    }

    if (heartbeatNodes.length === 0) {
      return;
    }

    const now = new Date();

    await Promise.all(
      heartbeatNodes.map(async (node) => {
        const parsed = ResourceHealthHeartbeatNodeDataSchema.safeParse(node.data ?? {});
        if (!parsed.success) {
          this.logger.warn(`Skipping heartbeat node ${node.id} with invalid data: ${parsed.error.message}`);
          return;
        }

        const identifier = (parsed.data.identifier ?? '').trim();
        const timeoutMs = parsed.data.timeoutSeconds * 1000;
        const reasonTemplate = (parsed.data.unhealthyReason ?? '').trim();
        const reason = reasonTemplate.length > 0 ? reasonTemplate : 'Heartbeat timed out';

        // Global nodes only watch resources that already beat through them.
        const resourceIds =
          node.resourceId === null
            ? [...this.heartbeatLastSeen.keys()]
                .filter((key) => identifierOfHeartbeatKey(key) === identifier)
                .map(resourceIdOfHeartbeatKey)
            : [node.resourceId];

        for (const resourceId of resourceIds) {
          const lastSeen = this.heartbeatLastSeen.get(heartbeatKey(resourceId, identifier));

          if (!lastSeen) {
            this.heartbeatLastSeen.set(heartbeatKey(resourceId, identifier), now);
            continue;
          }

          const elapsed = now.getTime() - lastSeen.getTime();
          if (elapsed < timeoutMs) {
            continue;
          }

          await this.resourceHealthService.reportHealth({
            resourceId,
            identifier,
            status: ResourceHealthStatus.UNHEALTHY,
            reason,
            source: ResourceHealthSource.HEARTBEAT,
            reportedAt: now,
          });
        }
      }),
    );
  }

  /** Every (no-activity node, machine with an active session) pair: the resource's own nodes and global ones. */
  private async noActivityPairs(): Promise<Array<{ node: ResourceFlowNode; resourceId: number }>> {
    const resourceNodes = await this.flowNodeRepository
      .createQueryBuilder('node')
      .innerJoin(ResourceUsage, 'usage', `usage.resourceId = node.resourceId AND ${activeUsageSql('usage')}`)
      .where('node.type = :type', { type: ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY })
      .distinct(true)
      .getMany();
    const pairs = resourceNodes.map((node) => ({ node, resourceId: node.resourceId as number }));

    const globalNodes = await this.flowNodeRepository.find({
      where: enabledGlobalNodesWhere(ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY),
    });
    if (globalNodes.length > 0) {
      const active: Array<{ resourceId: number }> = await this.flowNodeRepository.manager
        .createQueryBuilder(ResourceUsage, 'usage')
        .select('usage.resourceId', 'resourceId')
        .where(activeUsageSql('usage'))
        .distinct(true)
        .getRawMany();
      for (const node of globalNodes) {
        for (const { resourceId } of active) {
          pairs.push({ node, resourceId: Number(resourceId) });
        }
      }
    }
    return pairs;
  }

  public async checkResourceActivity() {
    await this.cronTimer.time('flow_minute_tick', async () => {
      const now = new Date();

      const pairs = await this.noActivityPairs();

      const currentKeys = new Set(pairs.map(({ node, resourceId }) => noActivityKey(node.id, resourceId)));
      for (const key of this.noActivityFiredAt.keys()) {
        if (!currentKeys.has(key)) this.noActivityFiredAt.delete(key);
      }

      await Promise.all(
        pairs.map(async ({ node, resourceId }) => {
          const parsedData = InputResourceActivityNoActivityNodeDataSchema.safeParse(node.data);
          if (!parsedData.success) {
            this.logger.warn(
              `Skipping resource inactivity node ${node.id} (resource ${resourceId}, flow ${node.flowId}) because of invalid data: ${parsedData.error.message}`,
            );
            return;
          }

          const { minInactivityMinutes } = parsedData.data;

          const lastActivity = this.resourceActivity.get(resourceId);
          if (!lastActivity) {
            this.resourceActivity.set(resourceId, now);
            return;
          }

          // Activity restarts the countdown; so does this node firing, but only for this pair.
          const key = noActivityKey(node.id, resourceId);
          const lastFired = this.noActivityFiredAt.get(key);
          const reference = lastFired && lastFired > lastActivity ? lastFired : lastActivity;

          const millisSinceReference = now.getTime() - reference.getTime();
          const minutesSinceReference = millisSinceReference / 1000 / 60;

          if (minutesSinceReference < minInactivityMinutes) {
            return;
          }

          this.logger.debug(
            `Resource ${resourceId} has been inactive for ${minutesSinceReference} minutes, triggering inactivity node`,
          );
          this.noActivityFiredAt.set(key, now);
          await this.startFlow(node, { payload: {} }, { triggeringResourceId: resourceId });
        }),
      );
    });
  }
}

function noActivityKey(nodeId: string, resourceId: number): string {
  return `${nodeId}::${resourceId}`;
}

function resourceIdOfHeartbeatKey(key: string): number {
  return Number(key.slice(0, key.indexOf('::')));
}

function identifierOfHeartbeatKey(key: string): string {
  return key.slice(key.indexOf('::') + 2);
}
