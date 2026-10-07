import { Cron, CronExpression } from '@nestjs/schedule';
import { ResourceFlowNodeType, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { ResourceMeteringServiceGetStatusOperation } from './resource-metering.service.resource-metering-service-get-status-operation';
export abstract class ResourceMeteringServiceCollectInterimReadingsOperation extends ResourceMeteringServiceGetStatusOperation {
  @Cron(CronExpression.EVERY_MINUTE)
  async collectInterimReadings(): Promise<void> {
    for (const meter of await this.meters.find()) {
      const key = String(meter.id);
      try {
        const definition = await this.getDefinition(meter.resourceId, meter.id);
        if (!definition.hasCollection || definition.collect.interimIntervalMinutes === 0) continue;
        const attempt = this.interimAttempts.get(key);
        if (
          attempt?.running ||
          Date.now() - (attempt?.at ?? meter.latestObservedAt?.getTime() ?? 0) <
            definition.collect.interimIntervalMinutes * 60_000
        )
          continue;
        if (await this.sessions.manager.existsBy(ResourceUsageLifecycleAttempt, { resourceId: meter.resourceId }))
          continue;
        const session = (await this.catalog.findActiveSessions(meter.resourceId)).find((s) => s.meterId === meter.id);
        this.interimAttempts.set(key, { at: Date.now(), running: true });
        try {
          await this.runOperation(
            session ?? { id: null, meterId: meter.id, resourceId: meter.resourceId, usageId: null },
            'interim',
            {
              trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
              timeoutSeconds: definition.collect.timeoutSeconds,
            },
          );
        } finally {
          this.interimAttempts.set(key, { at: Date.now(), running: false });
        }
      } catch (error) {
        this.logger.warn(`Meter ${meter.id} collection failed: ${this.reason(error)}`);
      }
    }
  }
}
