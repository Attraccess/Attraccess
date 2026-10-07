import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowWaitsForStartedSiblingSBeforeRejectingAFlow(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it.each(['trigger nodes', 'outgoing edges'])(
    'waits for started sibling %s before rejecting a flow',
    async (fanout) => {
      const input = scope.createNode({ id: 'input', type: ResourceFlowNodeType.INPUT_BUTTON });
      const siblingInput = scope.createNode({ id: 'sibling-input', type: ResourceFlowNodeType.INPUT_BUTTON });
      const failing = scope.createNode({
        id: 'failing',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        data: { serverId: 1, topic: 'failing', failureBehavior: 'fail-flow' },
      });
      const sibling = scope.createNode({
        id: 'sibling',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        data: { serverId: 1, topic: 'sibling', failureBehavior: 'fail-flow' },
      });
      [input, siblingInput, failing, sibling].forEach((node) => {
        scope.nodesById[node.id] = node;
      });
      scope.initialNodes = fanout === 'trigger nodes' ? [input, siblingInput] : [input];
      scope.edgesBySourceAndHandle =
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
      scope.mqttClientService.publish = jest.fn(async (_serverId, topic) => {
        if (topic === 'failing') throw new Error('First branch failed');
        markSiblingStarted();
        await siblingCompletion;
      });
      const rejected = jest.fn();
      scope.flowLogs.start(1);
      const completion = scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {}).catch((error) => {
        rejected(error);
        return error;
      });
      await siblingStarted;
      await new Promise<void>((resolve) => setImmediate(resolve));

      try {
        expect(rejected).not.toHaveBeenCalled();
        expect(scope.flowLogs.getLogs(1).logs.some((log) => log.type === 'flow.completed')).toBe(false);
      } finally {
        releaseSibling();
      }

      expect(await completion).toMatchObject({ message: 'First branch failed' });
      expect(rejected).toHaveBeenCalledTimes(1);
      expect(scope.mqttClientService.publish).toHaveBeenCalledTimes(2);
      expect(scope.flowLogs.getLogs(1).logs.some((log) => log.type === 'flow.completed')).toBe(true);
    },
  );
}
