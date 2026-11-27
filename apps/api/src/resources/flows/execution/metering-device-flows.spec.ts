import { FlowNodeRecord, ResourceFlowNodeType } from '@attraccess/application-models';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttClientService } from '../../../mqtt/mqtt-client.service';
import { MqttMessageEvent } from '../../../mqtt/mqtt-message.event';
import { topicMatches } from '../node-executors/flow.utils';
import type { MeteringReport, MeteringRunContext } from '../node-executors/node-executor.interface';
import { FlowLogRecorderService } from '../logs/flow-log-recorder.service';
import { createFakeFlowTriggerStore, type FakeFlowEdge } from './fixtures/fake-flow-trigger-store.test-fixture';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';

const T = ResourceFlowNodeType;
const SERVER = 2;
const METER = 1;
const PLUG = 'workshop/printer-plug';

/**
 * A broker with one Tasmota plug (default topic layout `<topic>/<prefix>/<command>`). Like a real broker it only
 * delivers to subscribed filters, and like a real plug it answers `Status 10` at once: the reply is delivered while
 * the publish of the command is still in flight, before its acknowledgement reaches the API.
 */
function createPlugBroker(events: EventEmitter2) {
  const subscriptions: string[] = [];
  const state = { total: 1234.567, online: true };
  const deliver = (topic: string, payload: unknown) => {
    if (subscriptions.some((filter) => topicMatches(filter, topic)))
      events.emit(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(SERVER, topic, payload));
  };
  const client = {
    subscribe: jest.fn(async (_serverId: number, topic: string) => {
      subscriptions.push(topic);
    }),
    unsubscribe: jest.fn(async (_serverId: number, topic: string) => {
      subscriptions.splice(subscriptions.indexOf(topic), 1);
    }),
    publish: jest.fn(async (_serverId: number, topic: string, payload: string) => {
      if (state.online && topic === `${PLUG}/cmnd/Status` && payload.trim() === '10') {
        deliver(`${PLUG}/stat/STATUS10`, {
          StatusSNS: { Time: '2026-11-26T22:00:00', ENERGY: { Total: state.total, Power: 120 } },
        });
      }
    }),
  };
  return { client, state, subscriptions };
}

type FlowNode = Pick<FlowNodeRecord, 'id' | 'type' | 'data'>;
type FlowEdge = { source: string; target: string; sourceHandle: 'output' | 'failure' };

/** The real flow executor (dispatch, engine, node executors) over in-memory flow tables and the plug broker. */
function createExecutor(nodes: FlowNode[], edges: FlowEdge[], mqtt: MqttClientService, events: EventEmitter2) {
  const records = nodes.map(
    (node) => ({ resourceId: 4, flowId: null, position: { x: 0, y: 0 }, ...node }) as unknown as FlowNodeRecord,
  );
  const edgesBySourceAndHandle: Record<string, FakeFlowEdge[]> = {};
  for (const edge of edges) {
    // A succeeding node continues on its output (`''` while results carry no handle), a failing one on `failure`.
    const keys = edge.sourceHandle === 'output' ? ['', 'output'] : ['failure'];
    for (const key of keys) (edgesBySourceAndHandle[`${edge.source}|${key}`] ??= []).push(edge);
  }
  const executor = new ResourceFlowsExecutorService(
    createFakeFlowTriggerStore({
      initialNodes: records,
      nodesById: Object.fromEntries(records.map((node) => [node.id, node])),
      edgesBySourceAndHandle,
    }),
    new FlowLogRecorderService(),
    mqtt,
    {} as never,
    {} as never,
    events,
    {} as never,
    { getAll: async () => ({ resource: {}, global: {} }), getMany: async () => ({}) } as never,
    { time: (_name: string, run: () => unknown) => run() } as never,
    {
      timeFlow: (_t: string, run: () => unknown) => run(),
      timeNode: (_n: string, run: () => unknown) => run(),
    } as never,
    {} as never,
    {} as never,
  );
  executor.attachMetering({ report: jest.fn() } as never);
  return executor;
}

/** Runs one metering operation the way the metering service does and returns what the flow reported. */
async function runMetering(executor: ResourceFlowsExecutorService, kind: MeteringRunContext['kind']) {
  const reports: MeteringReport[] = [];
  const trigger = kind === 'start' ? T.INPUT_METERING_START : T.INPUT_METERING_COLLECT;
  const metering: MeteringRunContext = {
    meterId: METER,
    operationId: `op-${kind}`,
    kind,
    complete: async (report) => {
      reports.push(report);
    },
  };
  const run = executor.runFlow(
    4,
    trigger,
    { metering: { meterId: METER, kind, operationId: metering.operationId } },
    undefined,
    { metering },
  );
  return { run, reports };
}

const total = '{{response.payload.StatusSNS.ENERGY.Total}}';

/** Asking the plug for its counter: the send node waits for the reply itself. */
const askPlug = (id: string) => ({
  id,
  type: T.OUTPUT_MQTT_SEND_MESSAGE,
  data: {
    serverId: SERVER,
    topic: `${PLUG}/cmnd/Status`,
    payload: '10',
    qos: 1,
    completionBehavior: 'acknowledged',
    responseTopic: `${PLUG}/stat/STATUS10`,
    responseTimeoutSeconds: 1,
    failureBehavior: 'fail-flow',
  },
});

/** A resource flow that meters a Tasmota plug: read the counter at the start and on every collection. */
const plugMeterFlow = () => ({
  nodes: [
    { id: 'start', type: T.INPUT_METERING_START, data: { meterId: METER, timeoutSeconds: 30 } },
    askPlug('ask-start'),
    {
      id: 'ready',
      type: T.OUTPUT_METERING_READY,
      data: { meterId: METER, source: 'Tasmota', baselineValue: total },
    },
    {
      id: 'collect',
      type: T.INPUT_METERING_COLLECT,
      data: { meterId: METER, timeoutSeconds: 30, finalAttempts: 3, finalRetryDelaySeconds: 5 },
    },
    askPlug('ask-collect'),
    {
      id: 'report',
      type: T.OUTPUT_METERING_REPORT,
      data: { meterId: METER, source: 'Tasmota', mode: 'total', value: total },
    },
  ] as FlowNode[],
  edges: [
    { source: 'start', target: 'ask-start', sourceHandle: 'output' },
    { source: 'ask-start', target: 'ready', sourceHandle: 'output' },
    { source: 'collect', target: 'ask-collect', sourceHandle: 'output' },
    { source: 'ask-collect', target: 'report', sourceHandle: 'output' },
  ] as FlowEdge[],
});

describe('metering a Tasmota plug over MQTT (flows as customers build them)', () => {
  let events: EventEmitter2;
  let broker: ReturnType<typeof createPlugBroker>;

  beforeEach(() => {
    for (const level of ['debug', 'log', 'warn', 'error'] as const)
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    events = new EventEmitter2();
    broker = createPlugBroker(events);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const executorFor = (flow: { nodes: FlowNode[]; edges: FlowEdge[] }) =>
    createExecutor(flow.nodes, flow.edges, broker.client as unknown as MqttClientService, events);

  it('starts the meter at the counter the plug reports', async () => {
    const { run, reports } = await runMetering(executorFor(plugMeterFlow()), 'start');
    await run;

    expect(reports).toEqual([{ kind: 'ready', baseline: { value: '1234.567' }, source: 'Tasmota' }]);
    // The reply topic is only held for the request.
    expect(broker.subscriptions).toEqual([]);
  });

  it.each(['interim', 'final'] as const)('reports the counter on an %s collection', async (kind) => {
    broker.state.total = 1236.04;
    const { run, reports } = await runMetering(executorFor(plugMeterFlow()), kind);
    await run;

    expect(reports).toEqual([{ kind: 'reading', mode: 'total', value: '1236.04', source: 'Tasmota' }]);
  });

  it('reports exactly once per collection, also when collections follow each other', async () => {
    const executor = executorFor(plugMeterFlow());
    const all: MeteringReport[] = [];
    for (const value of [1234.6, 1234.7, 1234.8]) {
      broker.state.total = value;
      const { run, reports } = await runMetering(executor, 'interim');
      await run;
      all.push(...reports);
    }

    expect(all.map((report) => report.kind === 'reading' && report.value)).toEqual(['1234.6', '1234.7', '1234.8']);
  });

  it('gives overlapping collections of one plug each their own reading', async () => {
    // The plug's counter moves between two requests; each collection must get the answer to its own request.
    broker.client.publish.mockImplementation(async (_serverId: number, topic: string) => {
      if (topic !== `${PLUG}/cmnd/Status`) return;
      broker.state.total = Number((broker.state.total + 0.1).toFixed(3));
      events.emit(
        MqttMessageEvent.EVENT_NAME,
        new MqttMessageEvent(SERVER, `${PLUG}/stat/STATUS10`, { StatusSNS: { ENERGY: { Total: broker.state.total } } }),
      );
    });
    const executor = executorFor(plugMeterFlow());

    const [interim, final] = await Promise.all([runMetering(executor, 'interim'), runMetering(executor, 'final')]);
    await Promise.all([interim.run, final.run]);

    expect([...interim.reports, ...final.reports]).toEqual([
      { kind: 'reading', mode: 'total', value: '1234.667', source: 'Tasmota' },
      { kind: 'reading', mode: 'total', value: '1234.767', source: 'Tasmota' },
    ]);
  });

  it('fails the start without reporting when the plug does not answer', async () => {
    broker.state.online = false;
    const { run, reports } = await runMetering(executorFor(plugMeterFlow()), 'start');

    await expect(run).rejects.toThrow(`No MQTT reply on topic '${PLUG}/stat/STATUS10' (server ${SERVER}) within 1s`);
    // No made-up baseline: the start fails and the metering service retries or reports it.
    expect(reports).toEqual([]);
    expect(broker.subscriptions).toEqual([]);
  });

  it('misses the reply when a separate wait node listens only after the send (why the reply topic exists)', async () => {
    // The shape customers built before the send node could wait: send, then wait for the reply.
    const askStart = askPlug('ask-start');
    const flow = {
      nodes: [
        { id: 'start', type: T.INPUT_METERING_START, data: { meterId: METER, timeoutSeconds: 30 } },
        { ...askStart, data: { ...askStart.data, responseTopic: undefined, responseTimeoutSeconds: undefined } },
        {
          id: 'wait',
          type: T.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
          data: { serverId: SERVER, topic: `${PLUG}/stat/STATUS10`, timeoutSeconds: 1, failureBehavior: 'fail-flow' },
        },
        {
          id: 'ready',
          type: T.OUTPUT_METERING_READY,
          data: { meterId: METER, source: 'Tasmota', baselineValue: '{{payload.StatusSNS.ENERGY.Total}}' },
        },
      ] as FlowNode[],
      edges: [
        { source: 'start', target: 'ask-start', sourceHandle: 'output' },
        { source: 'ask-start', target: 'wait', sourceHandle: 'output' },
        { source: 'wait', target: 'ready', sourceHandle: 'output' },
      ] as FlowEdge[],
    };

    const { run, reports } = await runMetering(executorFor(flow), 'start');

    await expect(run).rejects.toThrow(`Timeout waiting for MQTT message on topic '${PLUG}/stat/STATUS10'`);
    expect(reports).toEqual([]);
  });
});
