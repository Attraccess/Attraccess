import { Cron, CronExpression } from '@nestjs/schedule';
import { ResourceFlowsExecutorServiceStartFlowOperation } from './resource-flows-executor.service.resource-flows-executor-service-start-flow-operation';
export abstract class ResourceFlowsExecutorServiceCheckHealthHeartbeatsOperation extends ResourceFlowsExecutorServiceStartFlowOperation {
  @Cron(CronExpression.EVERY_MINUTE)
  public async checkHealthHeartbeats() {
    return this.monitor.checkHealthHeartbeats();
  }
}
