import {
  InputResourceActivityNoActivityNodeDataSchema,
  ResourceFlowNodeType,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSource,
  ResourceHealthStatus,
  ResourceUsage,
  ResourceUsageAction,
} from '@attraccess/database-entities';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FlowNodeExecutionImplementation } from './flow-node-execution';
import { heartbeatKey } from './node-executors';
export abstract class FlowResourceHealthImplementation extends FlowNodeExecutionImplementation {
  public trackResourceActivity(resourceId: number) {
    this.resourceActivity.set(resourceId, new Date());
  }

  public getHeartbeatLastSeen(resourceId: number, identifier: string): Date | undefined {
    return this.heartbeatLastSeen.get(heartbeatKey(resourceId, identifier));
  }

  @Cron(CronExpression.EVERY_MINUTE)
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

  @Cron(CronExpression.EVERY_MINUTE)
  public async checkResourceActivity() {
    await this.cronTimer.time('flow_minute_tick', async () => {
      const now = new Date();

      const onResourceInactivityNodes = await this.flowNodeRepository
        .createQueryBuilder('node')
        .innerJoin(
          ResourceUsage,
          'usage',
          'usage.resourceId = node.resourceId AND usage.endTime IS NULL AND usage.isFinalized = TRUE AND usage.usageAction = :usageAction',
          { usageAction: ResourceUsageAction.Usage },
        )
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
