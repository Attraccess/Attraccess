import { ResourceFlowNodeType, ResourceType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerUsesResourceMetadataInTemplatedMqttTopicsCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('uses resource metadata in templated MQTT topics', async () => {
    const inputNode = fixture.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const mqttNode = fixture.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: {
        serverId: 5,
        topic: 'devices/{{resource.metadata.deviceId}}/state',
        payload: 'ping',
      },
    });

    fixture.nodesById[inputNode.id] = inputNode;
    fixture.nodesById[mqttNode.id] = mqttNode;
    fixture.initialNodes = [inputNode];

    fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    fixture.edgesBySourceAndHandle[`${mqttNode.id}|`] = [];

    (fixture.resourceRepository.findOne as jest.Mock).mockResolvedValueOnce({
      id: 1,
      name: 'Resource 1',
      type: ResourceType.Machine,
      metadata: { deviceId: 'abc123' },
    });

    await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {});

    expect(fixture.mqttClientService.publish).toHaveBeenCalledWith(5, 'devices/abc123/state', 'ping', {
      qos: undefined,
      retain: undefined,
    });
  });
}
