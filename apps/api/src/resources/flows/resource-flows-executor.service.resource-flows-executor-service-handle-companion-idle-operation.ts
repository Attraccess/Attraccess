import { ResourceFlowNodeType, CompanionIdleActiveNodeDataSchema } from '@attraccess/database-entities';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceFlowsExecutorServiceGetHeartbeatLastSeenOperation } from './resource-flows-executor.service.resource-flows-executor-service-get-heartbeat-last-seen-operation';
export abstract class ResourceFlowsExecutorServiceHandleCompanionIdleOperation extends ResourceFlowsExecutorServiceGetHeartbeatLastSeenOperation {
  @OnEvent('companion.idle')
  async handleCompanionIdle(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggers.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_IDLE,
      event.payload,
      CompanionIdleActiveNodeDataSchema,
    );
  }
}
