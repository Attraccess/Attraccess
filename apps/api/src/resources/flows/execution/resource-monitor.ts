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
import { Repository } from 'typeorm';
import { ResourceHealthService } from '../../health/resource-health.service';
import { CronTimer } from '../../../metrics/instrumentation/cron/cron.helper';
import { NodeProcessingResult, heartbeatKey } from '../node-executors';
import { activeUsageSql } from '../../usage/sessions/active-usage';

/** Minute-based activity triggers and heartbeat expiry share the executor's live state. */
export class FlowResourceMonitor {
  constructor(
    private readonly flowNodeRepository: Repository<ResourceFlowNode>,
    private readonly resourceActivity: Map<number, Date>,
    private readonly heartbeatLastSeen: Map<string, Date>,
    private readonly resourceHealthService: ResourceHealthService,
    private readonly cronTimer: CronTimer,
    private readonly startFlow: (node: ResourceFlowNode, data: NodeProcessingResult) => Promise<NodeProcessingResult[]>,
    private readonly logger: Logger,
  ) {}

  public async checkHealthHeartbeats() {
    const heartbeatNodes = await this.flowNodeRepository.find({
      where: { type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT },
    });

    const validKeys = new Set<string>();
    for (const node of heartbeatNodes) {
      const parsed = ResourceHealthHeartbeatNodeDataSchema.safeParse(node.data ?? {});
      if (!parsed.success) {
        continue;
      }
      validKeys.add(heartbeatKey(node.resourceId, (parsed.data.identifier ?? '').trim()));
    }

    for (const key of this.heartbeatLastSeen.keys()) {
      if (!validKeys.has(key)) {
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
        const lastSeen = this.heartbeatLastSeen.get(heartbeatKey(node.resourceId, identifier));

        if (!lastSeen) {
          this.heartbeatLastSeen.set(heartbeatKey(node.resourceId, identifier), now);
          return;
        }

        const elapsed = now.getTime() - lastSeen.getTime();
        if (elapsed < timeoutMs) {
          return;
        }

        const reasonTemplate = (parsed.data.unhealthyReason ?? '').trim();
        const reason = reasonTemplate.length > 0 ? reasonTemplate : 'Heartbeat timed out';

        await this.resourceHealthService.reportHealth({
          resourceId: node.resourceId,
          identifier,
          status: ResourceHealthStatus.UNHEALTHY,
          reason,
          source: ResourceHealthSource.HEARTBEAT,
          reportedAt: now,
        });
      }),
    );
  }

  public async checkResourceActivity() {
    await this.cronTimer.time('flow_minute_tick', async () => {
      const now = new Date();

      const onResourceInactivityNodes = await this.flowNodeRepository
        .createQueryBuilder('node')
        .innerJoin(ResourceUsage, 'usage', `usage.resourceId = node.resourceId AND ${activeUsageSql('usage')}`)
        .where('node.type = :type', { type: ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY })
        .distinct(true)
        .getMany();

      await Promise.all(
        onResourceInactivityNodes.map(async (node) => {
          const parsedData = InputResourceActivityNoActivityNodeDataSchema.safeParse(node.data);
          if (!parsedData.success) {
            this.logger.warn(
              `Skipping resource inactivity node ${node.id} for resource flow of resource ${node.resourceId} because of invalid data: ${parsedData.error.message}`,
            );
            return;
          }

          const { minInactivityMinutes } = parsedData.data;

          const lastActivity = this.resourceActivity.get(node.resourceId);
          if (!lastActivity) {
            this.resourceActivity.set(node.resourceId, now);
            return;
          }

          const millisSinceLastActivity = now.getTime() - lastActivity.getTime();
          const minutesSinceLastActivity = millisSinceLastActivity / 1000 / 60;

          if (minutesSinceLastActivity < minInactivityMinutes) {
            return;
          }

          this.logger.debug(
            `Resource ${node.resourceId} has been inactive for ${minutesSinceLastActivity} minutes, triggering inactivity node`,
          );
          await this.startFlow(node, { payload: {} });

          this.resourceActivity.set(node.resourceId, now);
        }),
      );
    });
  }
}
