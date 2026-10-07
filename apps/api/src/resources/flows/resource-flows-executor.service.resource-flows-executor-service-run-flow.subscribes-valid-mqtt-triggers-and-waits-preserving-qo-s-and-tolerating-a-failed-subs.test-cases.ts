import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerSubscribesValidMqttTriggersAndWaitsPreservingQoSAndToleratingAFailedSubsCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('subscribes valid MQTT triggers and waits, preserving QoS and tolerating a failed subscription', async () => {
    fixture.initialNodes = [
      fixture.createNode({
        type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
        data: { serverId: 1, topic: 'events' },
      }),
      fixture.createNode({ type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, data: { topic: 'missing-server' } }),
      fixture.createNode({
        type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
        data: { serverId: 2, topic: 'reply', subscribeQos: 2 },
      }),
      fixture.createNode({ type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE, data: { serverId: 2 } }),
    ];
    fixture.mqttClientService.subscribe = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    await fixture.service.onModuleInit();
    expect(fixture.mqttClientService.subscribe).toHaveBeenCalledTimes(2);
    expect(fixture.mqttClientService.subscribe).toHaveBeenNthCalledWith(1, 1, 'events', undefined);
    expect(fixture.mqttClientService.subscribe).toHaveBeenNthCalledWith(2, 2, 'reply', 2);
  });
}
