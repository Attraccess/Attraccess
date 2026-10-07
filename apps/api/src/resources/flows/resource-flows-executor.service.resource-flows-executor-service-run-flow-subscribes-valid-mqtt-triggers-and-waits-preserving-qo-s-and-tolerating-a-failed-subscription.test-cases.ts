import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowSubscribesValidMqttTriggersAndWaitsPreservingQoSAndToleratingAFailedSubscription(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('subscribes valid MQTT triggers and waits, preserving QoS and tolerating a failed subscription', async () => {
    scope.initialNodes = [
      scope.createNode({
        type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
        data: { serverId: 1, topic: 'events' },
      }),
      scope.createNode({ type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, data: { topic: 'missing-server' } }),
      scope.createNode({
        type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
        data: { serverId: 2, topic: 'reply', subscribeQos: 2 },
      }),
      scope.createNode({ type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE, data: { serverId: 2 } }),
    ];
    scope.mqttClientService.subscribe = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    await scope.service.onModuleInit();
    expect(scope.mqttClientService.subscribe).toHaveBeenCalledTimes(2);
    expect(scope.mqttClientService.subscribe).toHaveBeenNthCalledWith(1, 1, 'events', undefined);
    expect(scope.mqttClientService.subscribe).toHaveBeenNthCalledWith(2, 2, 'reply', 2);
  });
}
