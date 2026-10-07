import { ResourceFlowsExecutorServiceHandleMqttMessageReceivedEventOperation } from './resource-flows-executor.service.resource-flows-executor-service-handle-mqtt-message-received-event-operation';
export abstract class ResourceFlowsExecutorServiceTriggerPluginFlowsOperation extends ResourceFlowsExecutorServiceHandleMqttMessageReceivedEventOperation {
  public async triggerPluginFlows(
    pluginName: string,
    nodeType: string,
    matches: (config: Record<string, unknown>, nodeId: string) => boolean,
    payload: object,
  ): Promise<void> {
    return this.triggers.triggerPluginFlows(pluginName, nodeType, matches, payload);
  }
}
