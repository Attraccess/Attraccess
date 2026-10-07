import { ResourceFlowNodeType, CompanionIdleActiveNodeDataSchema } from '@attraccess/database-entities';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceFlowsExecutorServiceHandleCompanionIdleOperation } from './resource-flows-executor.service.resource-flows-executor-service-handle-companion-idle-operation';
export abstract class ResourceFlowsExecutorServiceHandleCompanionActiveOperation extends ResourceFlowsExecutorServiceHandleCompanionIdleOperation {
  @OnEvent('companion.active')
  async handleCompanionActive(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggers.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_ACTIVE,
      event.payload,
      CompanionIdleActiveNodeDataSchema,
    );
  }
}
