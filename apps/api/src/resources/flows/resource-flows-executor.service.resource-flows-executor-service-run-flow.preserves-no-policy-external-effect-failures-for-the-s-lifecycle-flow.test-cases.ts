import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import axios from 'axios';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerPreservesNoPolicyExternalEffectFailuresForTheSLifecycleFlowCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it.each([
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER,
  ])('preserves no-policy external-effect failures for the %s lifecycle flow', async (triggerNodeType) => {
    const inputNode = fixture.createNode({ id: 'in-1', type: triggerNodeType });
    fixture.initialNodes = [inputNode];

    const expectLegacyFailure = async (
      node: ResourceFlowNode,
      setup: () => void,
      message: string | RegExp,
    ): Promise<void> => {
      fixture.nodesById = { [inputNode.id]: inputNode, [node.id]: node };
      fixture.edgesBySourceAndHandle = {
        [`${inputNode.id}|`]: [{ source: inputNode.id, target: node.id }],
        [`${node.id}|`]: [],
      };
      setup();

      await expect(fixture.service.runFlow(1, triggerNodeType, {})).rejects.toThrow(message);
    };

    await expectLegacyFailure(
      fixture.createNode({
        id: 'http-1',
        type: ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST,
        data: { url: 'https://example.com', method: 'POST' },
      }),
      () => (axios.request as jest.Mock).mockRejectedValueOnce(new Error('HTTP unavailable')),
      'HTTP unavailable',
    );
    await expectLegacyFailure(
      fixture.createNode({
        id: 'mqtt-1',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        data: { serverId: 1, topic: 'devices/state' },
      }),
      () => (fixture.mqttClientService.publish as jest.Mock).mockRejectedValueOnce(new Error('MQTT unavailable')),
      'MQTT unavailable',
    );
    await expectLegacyFailure(
      fixture.createNode({ id: 'end-1', type: ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION, data: {} }),
      () => (fixture.resourceUsageService.getActiveSession as jest.Mock).mockResolvedValueOnce(null),
      'NO_USAGE_SESSION',
    );
    await expectLegacyFailure(
      fixture.createNode({
        id: 'wait-1',
        type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
        data: { serverId: 1, topic: 'devices/state', timeoutSeconds: 1 },
      }),
      () => undefined,
      /Timeout waiting for MQTT message/,
    );
  });
}
