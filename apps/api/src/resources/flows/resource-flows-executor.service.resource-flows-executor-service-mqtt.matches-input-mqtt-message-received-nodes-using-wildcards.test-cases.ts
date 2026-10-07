import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../mqtt/mqtt-message.event';
import { registerResourceFlowsExecutorServiceMqttFixture } from './resource-flows-executor.service.resource-flows-executor-service-mqtt.test-fixture';

jest.mock('axios');
export function registerMatchesInputMqttMessageReceivedNodesUsingWildcardsCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceMqttFixture>,
) {
  it('matches INPUT_MQTT_MESSAGE_RECEIVED nodes using wildcards', async () => {
    const nodeA = {
      id: 'mqtt-a',
      type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
      resourceId: 1,
      position: { x: 0, y: 0 },
      data: { serverId: 5, topic: 'sensors/+/temp' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ResourceFlowNode;
    const nodeB = {
      id: 'mqtt-b',
      type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
      resourceId: 2,
      position: { x: 0, y: 0 },
      data: { serverId: 5, topic: 'sensors/#' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ResourceFlowNode;

    fixture.initialNodes = [nodeA, nodeB];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startFlowSpy = jest.spyOn(fixture.service as any, 'startFlow').mockResolvedValue([] as any);

    await fixture.service.handleMqttMessageReceivedEvent(
      new MqttMessageReceivedEvent(5, 'sensors/room1/temp', { t: 21 }),
    );

    expect(startFlowSpy).toHaveBeenCalled();
    const calledWith = (startFlowSpy.mock.calls[0] as unknown[])[0] as ResourceFlowNode[];
    const nodeIds = (Array.isArray(calledWith) ? calledWith : [calledWith]).map((n) => n.id);
    expect(new Set(nodeIds)).toEqual(new Set(['mqtt-a', 'mqtt-b']));
  });
}
