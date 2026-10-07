import { Cron, CronExpression } from '@nestjs/schedule';
import { ResourceFlowsExecutorServiceCheckHealthHeartbeatsOperation } from './resource-flows-executor.service.resource-flows-executor-service-check-health-heartbeats-operation';
export abstract class ResourceFlowsExecutorServiceCheckResourceActivityOperation extends ResourceFlowsExecutorServiceCheckHealthHeartbeatsOperation {
  @Cron(CronExpression.EVERY_MINUTE)
  public async checkResourceActivity() {
    return this.monitor.checkResourceActivity();
  }
}
