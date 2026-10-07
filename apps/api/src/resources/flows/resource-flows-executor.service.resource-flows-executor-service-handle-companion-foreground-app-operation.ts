import { ResourceFlowNodeType, CompanionForegroundAppNodeDataSchema } from '@attraccess/database-entities';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceFlowsExecutorServiceHandleCompanionActiveOperation } from './resource-flows-executor.service.resource-flows-executor-service-handle-companion-active-operation';
export abstract class ResourceFlowsExecutorServiceHandleCompanionForegroundAppOperation extends ResourceFlowsExecutorServiceHandleCompanionActiveOperation {
  @OnEvent('companion.foreground_app')
  async handleCompanionForegroundApp(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggers.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_FOREGROUND_APP_CHANGED,
      event.payload,
      CompanionForegroundAppNodeDataSchema,
    );
  }
}
