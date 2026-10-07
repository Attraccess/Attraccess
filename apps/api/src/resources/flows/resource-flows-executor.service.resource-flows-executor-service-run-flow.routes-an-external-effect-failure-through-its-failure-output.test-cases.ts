import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerRoutesAnExternalEffectFailureThroughItsFailureOutputCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('routes an external-effect failure through its failure output', async () => {
    const inputNode = fixture.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_BUTTON });
    const mqttNode = fixture.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state', failureBehavior: 'failure-output' },
    });
    const failureNode = fixture.createNode({
      id: 'failure-1',
      type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
      data: { entries: [] },
    });
    [inputNode, mqttNode, failureNode].forEach((node) => (fixture.nodesById[node.id] = node));
    fixture.initialNodes = [inputNode];
    fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    fixture.edgesBySourceAndHandle[`${mqttNode.id}|failure`] = [
      { source: mqttNode.id, target: failureNode.id, sourceHandle: 'failure' },
    ];
    fixture.edgesBySourceAndHandle[`${failureNode.id}|`] = [];
    fixture.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('Broker unavailable'));
    fixture.flowLogs.start(1);

    const result = await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { requestId: 'abc' });

    expect(result).toEqual([
      expect.objectContaining({
        requestId: 'abc',
        flowError: { kind: 'transport-dispatch', message: 'Broker unavailable' },
      }),
    ]);
    expect(
      JSON.parse(fixture.flowLogs.getLogs(1).logs.find((log) => log.type === 'node.processing.failed')?.payload ?? ''),
    ).toEqual(expect.objectContaining({ failureKind: 'transport-dispatch', failureBehavior: 'failure-output' }));
  });
}
