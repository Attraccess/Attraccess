import { ResourceFlowNodeType, type FlowNodeRecord } from '@attraccess/application-models';

import { MqttMessageEvent } from '../../../mqtt/mqtt-message.event';

import { registerPluginFlowNodes } from '../../../plugin-system/flows/node-registry';

import type { FakeFlowEdge } from './fixtures/fake-flow-trigger-store.test-fixture';

import { createNode } from './fixtures/node.test-fixture';

import { resetTestFixture } from './fixtures/setup.test-fixture';

import type { FlowExecutionTestScope } from './fixtures/flow-test-scope.test-fixture';

const SEND = ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE;
const WAIT = ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE;
const SET_PAYLOAD = ResourceFlowNodeType.PROCESSING_SET_PAYLOAD;

/** Which handle each edge leaves on; `null` is an older edge saved without a handle. */
type Wiring = Record<string, Array<[handle: string | null, target: string]>>;

// A node that succeeds continues only on its default output: never on `failure` or another named branch.
describe('output handle routing', () => {
  const scope = { createNode, errorShapeIndex: 0 } as FlowExecutionTestScope;

  beforeEach(() => {
    resetTestFixture(scope);
  });

  afterEach(() => {
    // The engine always names the handle it continues on; the store never sees `undefined`.
    for (const [, handle] of scope.flowStore.findOutgoingEdges.mock.calls) {
      expect(typeof handle).toBe('string');
    }
  });

  function build(nodes: FlowNodeRecord[], wiring: Wiring) {
    scope.initialNodes = [nodes[0]];
    scope.nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));
    const edges: Record<string, FakeFlowEdge[]> = {};
    for (const [source, outgoing] of Object.entries(wiring)) {
      for (const [handle, target] of outgoing) {
        const key = `${source}|${handle ?? ''}`;
        edges[key] = [...(edges[key] ?? []), { source, target, sourceHandle: handle }];
      }
    }
    scope.edgesBySourceAndHandle = edges;
  }

  /** The nodes the engine walked to, once per followed edge. */
  const visited = () => scope.flowStore.findNodeOnCanvasOf.mock.calls.map(([, nodeId]) => nodeId);

  const trigger = () => createNode({ id: 'trigger' });
  const recorder = (id: string) => createNode({ id, type: SET_PAYLOAD, data: { entries: [] } });
  const send = (data: Record<string, unknown> = {}) =>
    createNode({ id: 'send', type: SEND, data: { serverId: 1, topic: 'cmnd/plug/Status', payload: '10', ...data } });

  it('continues a successful MQTT send on output only, with older null-handle edges as output', async () => {
    build(
      [trigger(), send({ failureBehavior: 'failure-output' }), recorder('ok'), recorder('legacy'), recorder('bad')],
      {
        trigger: [[null, 'send']],
        send: [
          ['output', 'ok'],
          [null, 'legacy'],
          ['failure', 'bad'],
        ],
      },
    );

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});

    expect(visited().sort()).toEqual(['legacy', 'ok', 'send']);
    expect(scope.flowStore.findOutgoingEdges).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'send' }),
      'output',
      undefined,
    );
  });

  it('continues a successful MQTT wait on output only', async () => {
    const wait = createNode({
      id: 'wait',
      type: WAIT,
      data: { serverId: 1, topic: 'stat/plug/STATUS10', timeoutSeconds: 2, failureBehavior: 'failure-output' },
    });
    build([trigger(), wait, recorder('ok'), recorder('bad')], {
      trigger: [['output', 'wait']],
      wait: [
        ['output', 'ok'],
        ['failure', 'bad'],
      ],
    });
    setTimeout(
      () => scope.eventEmitter.emit(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(1, 'stat/plug/STATUS10', {})),
      50,
    );

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});

    expect(visited().sort()).toEqual(['ok', 'wait']);
  });

  it('routes a failure-output failure only to the failure edges, with the flow error', async () => {
    build(
      [trigger(), send({ failureBehavior: 'failure-output' }), recorder('ok'), recorder('legacy'), recorder('bad')],
      {
        trigger: [[null, 'send']],
        send: [
          ['output', 'ok'],
          [null, 'legacy'],
          ['failure', 'bad'],
        ],
      },
    );
    scope.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('broker down'));

    const results = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});

    expect(visited().sort()).toEqual(['bad', 'send']);
    expect(results).toEqual([
      expect.objectContaining({ flowError: expect.objectContaining({ kind: 'transport-dispatch' }) }),
    ]);
  });

  it('continues a log-and-continue failure on output and null-handle edges, never on failure', async () => {
    build(
      [trigger(), send({ failureBehavior: 'log-and-continue' }), recorder('ok'), recorder('legacy'), recorder('bad')],
      {
        trigger: [[null, 'send']],
        send: [
          ['output', 'ok'],
          [null, 'legacy'],
          ['failure', 'bad'],
        ],
      },
    );
    scope.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('broker down'));

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});

    expect(visited().sort()).toEqual(['legacy', 'ok', 'send']);
  });

  it('follows null-handle edges of a plugin trigger, which names the output handle', async () => {
    const type = 'plugin.routing.trigger';
    registerPluginFlowNodes('routing', [
      { type, label: 'Trigger', configSchema: {}, inputs: [], outputs: ['output'], isInput: true },
    ]);
    build(
      [createNode({ id: 'plugin-trigger', type: type as ResourceFlowNodeType }), recorder('legacy'), recorder('ok')],
      {
        'plugin-trigger': [
          [null, 'legacy'],
          ['output', 'ok'],
        ],
      },
    );

    await scope.service.runFlow(1, type as ResourceFlowNodeType, {});

    expect(visited().sort()).toEqual(['legacy', 'ok']);
  });

  it('follows only the branch an If node names', async () => {
    const decide = createNode({
      id: 'if',
      type: ResourceFlowNodeType.PROCESSING_IF,
      data: { path: 'on', comparisonOperator: '=', comparisonValue: 'true' },
    });
    build([trigger(), decide, recorder('yes'), recorder('no'), recorder('legacy'), recorder('default')], {
      trigger: [['output', 'if']],
      if: [
        ['output-true', 'yes'],
        ['output-false', 'no'],
        [null, 'legacy'],
        ['output', 'default'],
      ],
    });

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { on: true });

    expect(visited().sort()).toEqual(['if', 'yes']);
  });

  // The customer's Tasmota meter: send/wait failures fall back to a baseline of 0, which must not win on success.
  it('answers a metering start once with the real reading when send and wait succeed', async () => {
    const start = createNode({ id: 'start', type: ResourceFlowNodeType.INPUT_METERING_START, data: { meterId: 1 } });
    const wait = createNode({
      id: 'wait',
      type: WAIT,
      data: { serverId: 1, topic: 'stat/plug/STATUS10', timeoutSeconds: 2, failureBehavior: 'failure-output' },
    });
    const fallback = createNode({
      id: 'fallback',
      type: SET_PAYLOAD,
      data: { entries: [{ key: 'payload.Total', value: '0' }] },
    });
    const ready = createNode({
      id: 'ready',
      type: ResourceFlowNodeType.OUTPUT_METERING_READY,
      data: { meterId: 1, baselineValue: '{{payload.Total}}' },
    });
    build([start, send({ failureBehavior: 'failure-output' }), wait, fallback, ready], {
      start: [['output', 'send']],
      send: [
        ['output', 'wait'],
        ['failure', 'fallback'],
      ],
      wait: [
        ['output', 'ready'],
        ['failure', 'fallback'],
      ],
      fallback: [['output', 'ready']],
    });
    const complete = jest.fn().mockResolvedValue(undefined);
    setTimeout(
      () =>
        scope.eventEmitter.emit(
          MqttMessageEvent.EVENT_NAME,
          new MqttMessageEvent(1, 'stat/plug/STATUS10', { Total: 12.5 }),
        ),
      50,
    );

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_METERING_START, {}, undefined, {
      metering: { meterId: 1, operationId: 'op-1', kind: 'start', complete },
    });

    expect(visited()).not.toContain('fallback');
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith({ kind: 'ready', baseline: { value: '12.5' }, source: undefined });
  });
});
