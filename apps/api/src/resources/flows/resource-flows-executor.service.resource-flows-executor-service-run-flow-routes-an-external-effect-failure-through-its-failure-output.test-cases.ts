import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowRoutesAnExternalEffectFailureThroughItsFailureOutput(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('routes an external-effect failure through its failure output', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_BUTTON });
    const mqttNode = scope.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state', failureBehavior: 'failure-output' },
    });
    const failureNode = scope.createNode({
      id: 'failure-1',
      type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
      data: { entries: [] },
    });
    [inputNode, mqttNode, failureNode].forEach((node) => (scope.nodesById[node.id] = node));
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    scope.edgesBySourceAndHandle[`${mqttNode.id}|failure`] = [
      { source: mqttNode.id, target: failureNode.id, sourceHandle: 'failure' },
    ];
    scope.edgesBySourceAndHandle[`${failureNode.id}|`] = [];
    scope.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('Broker unavailable'));
    scope.flowLogs.start(1);

    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { requestId: 'abc' });

    expect(result).toEqual([
      expect.objectContaining({
        requestId: 'abc',
        flowError: { kind: 'transport-dispatch', message: 'Broker unavailable' },
      }),
    ]);
    expect(
      JSON.parse(scope.flowLogs.getLogs(1).logs.find((log) => log.type === 'node.processing.failed')?.payload ?? ''),
    ).toEqual(expect.objectContaining({ failureKind: 'transport-dispatch', failureBehavior: 'failure-output' }));
  });
}
