import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerWaitsForStartedSiblingSBeforeRejectingAFlowCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it.each(['trigger nodes', 'outgoing edges'])(
    'waits for started sibling %s before rejecting a flow',
    async (fanout) => {
      const input = fixture.createNode({ id: 'input', type: ResourceFlowNodeType.INPUT_BUTTON });
      const siblingInput = fixture.createNode({ id: 'sibling-input', type: ResourceFlowNodeType.INPUT_BUTTON });
      const failing = fixture.createNode({
        id: 'failing',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        data: { serverId: 1, topic: 'failing', failureBehavior: 'fail-flow' },
      });
      const sibling = fixture.createNode({
        id: 'sibling',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        data: { serverId: 1, topic: 'sibling', failureBehavior: 'fail-flow' },
      });
      [input, siblingInput, failing, sibling].forEach((node) => {
        fixture.nodesById[node.id] = node;
      });
      fixture.initialNodes = fanout === 'trigger nodes' ? [input, siblingInput] : [input];
      fixture.edgesBySourceAndHandle =
        fanout === 'trigger nodes'
          ? {
              'input|': [{ source: input.id, target: failing.id }],
              'sibling-input|': [{ source: siblingInput.id, target: sibling.id }],
            }
          : {
              'input|': [
                { source: input.id, target: failing.id },
                { source: input.id, target: sibling.id },
              ],
            };
      let releaseSibling: () => void;
      let markSiblingStarted: () => void;
      const siblingStarted = new Promise<void>((resolve) => {
        markSiblingStarted = resolve;
      });
      const siblingCompletion = new Promise<void>((resolve) => {
        releaseSibling = resolve;
      });
      fixture.mqttClientService.publish = jest.fn(async (_serverId, topic) => {
        if (topic === 'failing') throw new Error('First branch failed');
        markSiblingStarted();
        await siblingCompletion;
      });
      const rejected = jest.fn();
      fixture.flowLogs.start(1);
      const completion = fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {}).catch((error) => {
        rejected(error);
        return error;
      });
      await siblingStarted;
      await new Promise<void>((resolve) => setImmediate(resolve));

      try {
        expect(rejected).not.toHaveBeenCalled();
        expect(fixture.flowLogs.getLogs(1).logs.some((log) => log.type === 'flow.completed')).toBe(false);
      } finally {
        releaseSibling();
      }

      expect(await completion).toMatchObject({ message: 'First branch failed' });
      expect(rejected).toHaveBeenCalledTimes(1);
      expect(fixture.mqttClientService.publish).toHaveBeenCalledTimes(2);
      expect(fixture.flowLogs.getLogs(1).logs.some((log) => log.type === 'flow.completed')).toBe(true);
    },
  );
}
