import type { NodeProcessingResult } from './node-executors';
import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerRoutesALoggedExternalEffectFailureThroughItsNormalOutputCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('routes a logged external-effect failure through its normal output', async () => {
    const inputNode = fixture.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_BUTTON });
    const mqttNode = fixture.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state', failureBehavior: 'log-and-continue' },
    });
    const continuationNode = fixture.createNode({
      id: 'continuation-1',
      type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
      data: { entries: [] },
    });
    [inputNode, mqttNode, continuationNode].forEach((node) => (fixture.nodesById[node.id] = node));
    fixture.initialNodes = [inputNode];
    fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    fixture.edgesBySourceAndHandle[`${mqttNode.id}|output`] = [
      { source: mqttNode.id, target: continuationNode.id, sourceHandle: 'output' },
    ];
    fixture.edgesBySourceAndHandle[`${mqttNode.id}|failure`] = [];
    fixture.edgesBySourceAndHandle[`${continuationNode.id}|`] = [];
    fixture.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('Broker unavailable'));
    const processNode = jest.spyOn(
      fixture.service as unknown as { processNode: () => Promise<NodeProcessingResult[]> },
      'processNode',
    );

    await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { requestId: 'abc' });

    expect(processNode).toHaveBeenCalledWith(
      expect.any(String),
      continuationNode,
      expect.objectContaining({ outputHandle: 'output' }),
      undefined,
      expect.any(Map),
      {},
    );
  });
}
