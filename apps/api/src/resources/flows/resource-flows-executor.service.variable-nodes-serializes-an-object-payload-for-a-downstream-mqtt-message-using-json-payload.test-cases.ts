import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { VariableNodesTestScope } from './resource-flows-executor.service.spec';
export function registerVariableNodesSerializesAnObjectPayloadForADownstreamMqttMessageUsingJsonPayload(
  scope: VariableNodesTestScope,
): void {
  it('serializes an object payload for a downstream MQTT message using {{json payload}}', async () => {
    const inputNode = scope.createNode({ id: 'trigger-1', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId: 1 });
    const mqttNode = scope.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      resourceId: 1,
      data: { serverId: 42, topic: 'devices/update', payload: '{{json payload}}', qos: 1, retain: false },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[mqttNode.id] = mqttNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    scope.edgesBySourceAndHandle[`${mqttNode.id}|`] = [];

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { payload: { enabled: true } });

    expect(scope.mqttClientService.publish).toHaveBeenCalledWith(42, 'devices/update', '{"enabled":true}', {
      qos: 1,
      retain: false,
    });
  });
}
