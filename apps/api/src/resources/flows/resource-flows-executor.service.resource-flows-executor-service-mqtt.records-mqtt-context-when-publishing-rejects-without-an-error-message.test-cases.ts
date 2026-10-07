import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceMqttFixture } from './resource-flows-executor.service.resource-flows-executor-service-mqtt.test-fixture';

jest.mock('axios');
export function registerRecordsMqttContextWhenPublishingRejectsWithoutAnErrorMessageCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceMqttFixture>,
) {
  it('records MQTT context when publishing rejects without an error message', async () => {
    const inputNode = fixture.createNode({ id: 'in-1' });
    const outputNode = fixture.createNode({
      id: 'output-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state', payload: 'on' },
    });

    fixture.initialNodes = [inputNode];
    fixture.nodesById = { [inputNode.id]: inputNode, [outputNode.id]: outputNode };
    fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: outputNode.id }];
    fixture.mqttClientService.publish = jest.fn().mockRejectedValue({});
    fixture.flowLogs.start(1);

    await expect(fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {})).rejects.toThrow(
      "Failed to publish MQTT message to topic 'devices/state' on server 1: no error details were provided",
    );

    const failedLog = fixture.flowLogs.getLogs(1).logs.find((log) => log.type === 'node.processing.failed');
    expect(failedLog).toBeDefined();
    expect(JSON.parse(failedLog?.payload ?? '')).toEqual({
      error: "Failed to publish MQTT message to topic 'devices/state' on server 1: no error details were provided",
      failureKind: 'transport-dispatch',
      failureBehavior: 'fail-flow',
    });
  });
}
