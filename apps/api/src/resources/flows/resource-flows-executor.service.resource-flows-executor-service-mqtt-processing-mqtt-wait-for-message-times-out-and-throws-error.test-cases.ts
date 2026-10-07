import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceMqttTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceMqttProcessingMqttWaitForMessageTimesOutAndThrowsError(
  scope: ResourceFlowsExecutorServiceMqttTestScope,
): void {
  it('processing.mqtt.waitForMessage times out and throws error', async () => {
    const inputNode = {
      id: 'in-1',
      type: ResourceFlowNodeType.INPUT_BUTTON,
      resourceId: 1,
      position: { x: 0, y: 0 },
      data: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ResourceFlowNode;

    const waitNode = {
      id: 'wait-1',
      type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
      resourceId: 1,
      position: { x: 0, y: 0 },
      data: { serverId: 8, topic: 'foo/#', timeoutSeconds: 1, failureBehavior: 'fail-flow' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ResourceFlowNode;

    scope.initialNodes = [inputNode];
    scope.nodesById = { [inputNode.id]: inputNode, [waitNode.id]: waitNode } as unknown as Record<
      string,
      ResourceFlowNode
    >;
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: waitNode.id }];
    scope.edgesBySourceAndHandle[`${waitNode.id}|`] = [];
    scope.flowLogs.start(1);

    await expect(scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {})).rejects.toThrow(
      /Timeout waiting for MQTT message/,
    );

    const failedLog = scope.flowLogs.getLogs(1).logs.find((log) => log.type === 'node.processing.failed');
    expect(failedLog).toBeDefined();
    expect(JSON.parse(failedLog?.payload ?? '')).toEqual({
      error: "Timeout waiting for MQTT message on topic 'foo/#' (server 8)",
      failureKind: 'acknowledgement-timeout',
      failureBehavior: 'fail-flow',
    });
  });
}
