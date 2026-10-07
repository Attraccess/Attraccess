import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerPreservesTheLegacyFlowFailureBehaviorWhenNoPolicyWasSavedCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('preserves the legacy flow failure behavior when no policy was saved', async () => {
    const inputNode = fixture.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_BUTTON });
    const mqttNode = fixture.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state' },
    });
    [inputNode, mqttNode].forEach((node) => (fixture.nodesById[node.id] = node));
    fixture.initialNodes = [inputNode];
    fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    fixture.edgesBySourceAndHandle[`${mqttNode.id}|`] = [];
    fixture.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('Broker unavailable'));

    await expect(fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {})).rejects.toThrow(
      'Broker unavailable',
    );
  });
}
