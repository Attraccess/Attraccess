import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowPropagatesAnExternalEffectFailureWhenConfiguredToFailTheFlow(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('propagates an external-effect failure when configured to fail the flow', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_BUTTON });
    const mqttNode = scope.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state', failureBehavior: 'fail-flow' },
    });
    [inputNode, mqttNode].forEach((node) => (scope.nodesById[node.id] = node));
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    scope.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('Broker unavailable'));

    await expect(scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {})).rejects.toMatchObject({
      message: 'Broker unavailable',
      failureKind: 'transport-dispatch',
      status: 503,
    });
  });
}
