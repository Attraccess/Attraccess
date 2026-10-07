import { OnEvent } from '@nestjs/event-emitter';
import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../mqtt/mqtt-message.event';
import { ResourceFlowsExecutorServiceOnModuleInitOperation } from './resource-flows-executor.service.resource-flows-executor-service-on-module-init-operation';
export abstract class ResourceFlowsExecutorServiceHandleMqttMessageReceivedEventOperation extends ResourceFlowsExecutorServiceOnModuleInitOperation {
  @OnEvent(MqttMessageReceivedEvent.EVENT_NAME)
  async handleMqttMessageReceivedEvent(event: MqttMessageReceivedEvent) {
    return this.triggers.handleMqttMessageReceivedEvent(event);
  }
}
