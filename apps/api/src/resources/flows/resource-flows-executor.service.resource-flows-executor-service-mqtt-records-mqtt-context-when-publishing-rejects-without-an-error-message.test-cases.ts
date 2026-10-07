import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceMqttTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceMqttRecordsMqttContextWhenPublishingRejectsWithoutAnErrorMessage(
  scope: ResourceFlowsExecutorServiceMqttTestScope,
): void {
  it('records MQTT context when publishing rejects without an error message', async () => {
    const inputNode = scope.createNode({ id: 'in-1' });
    const outputNode = scope.createNode({
      id: 'output-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state', payload: 'on' },
    });

    scope.initialNodes = [inputNode];
    scope.nodesById = { [inputNode.id]: inputNode, [outputNode.id]: outputNode };
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: outputNode.id }];
    scope.mqttClientService.publish = jest.fn().mockRejectedValue({});
    scope.flowLogs.start(1);

    await expect(scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {})).rejects.toThrow(
      "Failed to publish MQTT message to topic 'devices/state' on server 1: no error details were provided",
    );

    const failedLog = scope.flowLogs.getLogs(1).logs.find((log) => log.type === 'node.processing.failed');
    expect(failedLog).toBeDefined();
    expect(JSON.parse(failedLog?.payload ?? '')).toEqual({
      error: "Failed to publish MQTT message to topic 'devices/state' on server 1: no error details were provided",
      failureKind: 'transport-dispatch',
      failureBehavior: 'fail-flow',
    });
  });
}
