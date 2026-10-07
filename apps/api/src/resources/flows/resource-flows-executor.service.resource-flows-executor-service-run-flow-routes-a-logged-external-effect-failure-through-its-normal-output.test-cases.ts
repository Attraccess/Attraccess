import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowRoutesALoggedExternalEffectFailureThroughItsNormalOutput(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('routes a logged external-effect failure through its normal output', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_BUTTON });
    const mqttNode = scope.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state', failureBehavior: 'log-and-continue' },
    });
    const continuationNode = scope.createNode({
      id: 'continuation-1',
      type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
      data: { entries: [] },
    });
    [inputNode, mqttNode, continuationNode].forEach((node) => (scope.nodesById[node.id] = node));
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    scope.edgesBySourceAndHandle[`${mqttNode.id}|output`] = [
      { source: mqttNode.id, target: continuationNode.id, sourceHandle: 'output' },
    ];
    scope.edgesBySourceAndHandle[`${mqttNode.id}|failure`] = [];
    scope.edgesBySourceAndHandle[`${continuationNode.id}|`] = [];
    scope.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('Broker unavailable'));
    scope.flowLogs.start(1);

    const results = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { requestId: 'abc' });

    expect(results).toEqual([expect.objectContaining({ requestId: 'abc' })]);
    expect(scope.flowLogs.getLogs(1).logs).toContainEqual(
      expect.objectContaining({ nodeId: continuationNode.id, type: 'node.processing.completed' }),
    );
  });
}
