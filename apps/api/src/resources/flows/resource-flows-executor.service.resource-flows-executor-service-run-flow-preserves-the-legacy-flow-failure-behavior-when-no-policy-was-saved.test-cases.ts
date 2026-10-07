import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowPreservesTheLegacyFlowFailureBehaviorWhenNoPolicyWasSaved(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('preserves the legacy flow failure behavior when no policy was saved', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_BUTTON });
    const mqttNode = scope.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state' },
    });
    [inputNode, mqttNode].forEach((node) => (scope.nodesById[node.id] = node));
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    scope.edgesBySourceAndHandle[`${mqttNode.id}|`] = [];
    scope.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('Broker unavailable'));

    await expect(scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {})).rejects.toThrow('Broker unavailable');
  });
}
