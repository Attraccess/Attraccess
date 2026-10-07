import { ResourceFlowNodeType, ResourceType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowUsesResourceMetadataInTemplatedMqttTopics(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('uses resource metadata in templated MQTT topics', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const mqttNode = scope.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: {
        serverId: 5,
        topic: 'devices/{{resource.metadata.deviceId}}/state',
        payload: 'ping',
      },
    });

    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[mqttNode.id] = mqttNode;
    scope.initialNodes = [inputNode];

    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    scope.edgesBySourceAndHandle[`${mqttNode.id}|`] = [];

    (scope.resourceRepository.findOne as jest.Mock).mockResolvedValueOnce({
      id: 1,
      name: 'Resource 1',
      type: ResourceType.Machine,
      metadata: { deviceId: 'abc123' },
    });

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {});

    expect(scope.mqttClientService.publish).toHaveBeenCalledWith(5, 'devices/abc123/state', 'ping', {
      qos: undefined,
      retain: undefined,
    });
  });
}
