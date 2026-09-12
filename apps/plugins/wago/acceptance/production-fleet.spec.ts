/* eslint-disable @nx/enforce-module-boundaries -- Acceptance deliberately connects the standalone runtime, plugin and real host graph executor. */
import 'reflect-metadata';
import { createServer, type Server, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectAsync, type MqttClient } from 'mqtt';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { ResourceFlowNode, ResourceFlowEdge } from '@attraccess/database-entities';
import { ResourceFlowsExecutorService } from '../../../api/src/resources/flows/resource-flows-executor.service';
import { registerPluginFlowNodes } from '../../../api/src/plugin-system/plugin-flow-node-registry';
import plugin from '../backend/plugin';
import { WagoFlowService } from '../backend/wago-flow.service';
import { WagoService } from '../backend/wago.service';
import { WagoController } from '../backend/wago-controller.entity';
import { WagoSettings } from '../backend/wago-settings.entity';
import { WagoConfigurationRevision } from '../backend/wago-configuration-revision.entity';
import { parseOperationalMessage } from '../backend/protocol';
import { validateSnapshot as validateBackend } from '../backend/configuration';
import {
  WagoRuntime,
  JsonStateStore,
  hash,
  validateSnapshot,
  type Snapshot,
  type Transport,
} from '../cc100-runtime/src/runtime';
import { Cc100OnboardIoAdapter } from '../cc100-runtime/src/adapters';
import { ModbusDeviceRouter } from '../cc100-runtime/src/modbus/adapter';

const temporary = process.env.WAGO_FLEET_TEMP ?? '';
const prefix = `fixture/${randomUUID()}`;
const hardwareId = 'production-fleet-fixture';
const base = `${prefix}/v1/controllers/${hardwareId}`;
type Wire = {
  topic: string;
  payload: Buffer;
  body: {
    id: string;
    expiresAt: string;
    channelId: string;
    streamId: string;
    sequence: number;
    status: string;
    inputs?: Record<string, boolean>;
  };
};
type Log = { nodeId: string; type: string; payload?: () => { output: { wago: object } }; flowRunId: string };
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('Expected fixture evidence is missing');
  return value;
}
async function eventually(assertion: () => void | Promise<void>, timeout = 6000): Promise<void> {
  const deadline = Date.now() + timeout;
  let last: unknown;
  do {
    try {
      await assertion();
      return;
    } catch (error) {
      last = error;
    }
    await delay(20);
  } while (Date.now() < deadline);
  throw last;
}

describe('production fleet acceptance — RabbitMQ / packed-register / Modbus TCP fixtures, NOT hardware qualification', () => {
  let database: DataSource;
  let runtime: WagoRuntime;
  let backend: WagoService;
  let flow: WagoFlowService;
  let deviceClient: MqttClient;
  let backendClient: MqttClient;
  let observer: MqttClient;
  let server: Server;
  let snapshot: Snapshot;
  let controllerId: number;
  let modbusRaw = 12.375;
  let holdAcknowledgement = false;
  let heldAcknowledgement: { topic: string; payload: unknown; release: () => Promise<void> } | undefined;
  const sockets = new Set<Socket>();
  const messages: Wire[] = [];
  const processedAcknowledgements = new Set<string>();
  const errors: unknown[] = [];
  const warnings: string[] = [];
  const logs: Log[] = [];
  const modbusRequests: Buffer[] = [];
  const nodes: ResourceFlowNode[] = [];
  const edges: ResourceFlowEdge[] = [];
  const din = join(temporary ?? '', 'din');
  const dout = join(temporary ?? '', 'dout');
  const statePath = join(temporary ?? '', 'runtime.json');
  const query = (channelId: string, category = 'state') => ({ controllerId, channelId, category });
  const completed = (id: string) => logs.filter((log) => log.nodeId === id && log.type === 'node.processing.completed');
  const wire = (suffix: string) => messages.filter((message) => message.topic === `${base}/${suffix}`);

  beforeAll(async () => {
    const url = process.env.WAGO_FLEET_MQTT_URL;
    if (!temporary || !url || !/^mqtt:\/\/127\.0\.0\.1:\d+$/.test(url))
      throw new Error(
        'Run node scripts/test-wago-production-fleet.mjs; only a runner-owned loopback broker is allowed',
      );
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation((error) => errors.push(error));
    await writeFile(din, '0');
    await writeFile(dout, '8'); // DO4 is unrelated to either flow and must survive read/modify/write.
    server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', (error) => errors.push(error));
      let pending = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= 7 && pending.length >= 6 + pending.readUInt16BE(4)) {
          const length = 6 + pending.readUInt16BE(4);
          const request = Buffer.from(pending.subarray(0, length));
          pending = pending.subarray(length);
          modbusRequests.push(request);
          // Explicit fixture map: unit 7, FC03, zero-based register 12, IEEE float32.
          if (
            request[6] !== 7 ||
            request[7] !== 3 ||
            request.readUInt16BE(8) !== 12 ||
            request.readUInt16BE(10) !== 2
          ) {
            errors.push(new Error(`Unexpected Modbus request ${request.toString('hex')}`));
            socket.destroy();
            return;
          }
          const response = Buffer.alloc(13);
          request.copy(response, 0, 0, 7);
          response.writeUInt16BE(7, 4);
          response[7] = 3;
          response[8] = 4;
          response.writeFloatBE(modbusRaw, 9);
          socket.end(response);
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing loopback Modbus port');
    snapshot = {
      version: 1,
      physicalPoints: [
        { id: 'di1', hardwareProfile: '751-9301', channel: 4 },
        { id: 'do1', hardwareProfile: '751-9301', channel: 0 },
        { id: 'do2', hardwareProfile: '751-9301', channel: 1 },
        { id: 'meter', hardwareProfile: 'modbus', channel: 0, modbus: { deviceId: 'meter', measurementId: 'power' } },
      ],
      logicalChannels: [
        {
          id: 'input',
          physicalPointId: 'di1',
          profile: 'generic-monitored-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          id: 'input-load',
          physicalPointId: 'do1',
          profile: 'generic-digital-output',
          capabilities: ['output'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          id: 'meter-load',
          physicalPointId: 'do2',
          profile: 'generic-digital-output',
          capabilities: ['output'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          id: 'power',
          physicalPointId: 'meter',
          profile: 'generic-monitored-input',
          capabilities: ['input', 'measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'watt', scale: 1, offset: 0, kind: 'live' },
        },
      ],
      modbus: {
        connections: [
          {
            id: 'tcp',
            transport: 'tcp',
            host: '127.0.0.1',
            port: address.port,
            timeoutMs: 1000,
            reconnectMs: 0,
            queueLimit: 4,
          },
        ],
        devices: [
          {
            id: 'meter',
            name: 'Loopback fixture only',
            connectionId: 'tcp',
            unitId: 7,
            profileId: 'fixture-map',
            profileVersion: 1,
          },
        ],
        profiles: [
          {
            id: 'fixture-map',
            name: 'Unqualified fixture register map',
            version: 1,
            actions: [],
            measurements: [
              {
                id: 'power',
                name: 'Power',
                functionCode: 3,
                address: 12,
                addressBase: 0,
                dataType: 'float32',
                byteOrder: 'big',
                wordOrder: 'big',
                scale: 1,
                offset: 0,
                unit: 'watt',
                kind: 'live',
                pollIntervalMs: 100,
              },
            ],
          },
        ],
      },
    };
    expect(validateSnapshot(snapshot)).toEqual([]);
    expect(validateBackend(snapshot)).toEqual([]);
    database = new DataSource({ type: 'sqlite', database: ':memory:', entities: plugin.entities, synchronize: true });
    await database.initialize();
    const now = new Date().toISOString();
    const controller = await database.getRepository(WagoController).save({
      hardwareId,
      trustState: 'claimed',
      name: 'Fixture',
      mqttServerId: 1,
      pairingCodeHash: 'fixture',
      protocolVersion: '1.0.0',
      runtimeVersion: '0.1.0',
      capabilities: '[]',
      lastSequence: 0,
      lastHeartbeatAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    controllerId = controller.id;
    await database.getRepository(WagoSettings).save({ id: 1, defaultMqttServerId: 1, operationalPrefix: prefix });
    await database.getRepository(WagoConfigurationRevision).save({
      controllerId,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: JSON.stringify(snapshot),
      state: 'applied',
      publishedAt: now,
    });
    const mqttOptions = {
      username: 'fixture',
      password: process.env.WAGO_FLEET_MQTT_PASSWORD,
      reconnectPeriod: 0,
      connectTimeout: 5000,
    };
    deviceClient = await connectAsync(url, { ...mqttOptions, clientId: `device-${randomUUID()}` });
    backendClient = await connectAsync(url, { ...mqttOptions, clientId: `backend-${randomUUID()}` });
    observer = await connectAsync(url, { ...mqttOptions, clientId: `observer-${randomUUID()}` });
    for (const client of [deviceClient, backendClient, observer]) client.on('error', (error) => errors.push(error));
    observer.on('message', (topic, payload) => messages.push({ topic, payload, body: JSON.parse(payload.toString()) }));
    await observer.subscribeAsync(`${base}/#`, { qos: 1 });
    const context = {
      getRepository: (entity) => database.getRepository(entity),
      get: (service) => {
        if (service === WagoService) return backend;
        throw new Error(`Unexpected service lookup: ${service.name}`);
      },
      logger: { warn: (message: string) => warnings.push(message) },
      mqtt: {
        publish: async (_server, topic, payload, options) => {
          await backendClient.publishAsync(topic, payload, options);
        },
        subscribe: async (_server, filter, listener) => {
          const handler = (topic: string, payload: Buffer, packet) => {
            const parts = topic.split('/');
            if (
              filter
                .split('/')
                .every((part: string, index: number) => part === '#' || part === '+' || part === parts[index])
            )
              Promise.resolve(listener({ topic, payload, retain: packet.retain }))
                .then(() => {
                  // Record processing only after the real backend callback returns.
                  if (topic === `${base}/acknowledgements`)
                    processedAcknowledgements.add(JSON.parse(payload.toString()).id);
                })
                .catch((error) => errors.push(error));
          };
          backendClient.on('message', handler);
          await backendClient.subscribeAsync(filter, { qos: 1 });
          return { unsubscribe: () => backendClient.off('message', handler) };
        },
      },
      // This is the real host SDK forwarding boundary, not a test flow callback.
      flows: { trigger: (type, matches, payload) => executor.triggerPluginFlows('wago', type, matches, payload) },
    } as unknown as PluginContext;
    backend = new WagoService(context);
    const module = plugin.register(context);
    const provider = (module.providers ?? []).find(
      (provider) => typeof provider === 'object' && 'provide' in provider && provider.provide === WagoFlowService,
    );
    if (!provider || typeof provider !== 'object' || !('useValue' in provider))
      throw new Error('Missing production flow provider');
    flow = provider.useValue;
    if (typeof plugin.flowNodes !== 'function') throw new Error('Missing production node factory');
    registerPluginFlowNodes('wago', plugin.flowNodes(context));
    // Only host persistence for the saved graph and unrelated application services
    // are fixtures. Node dispatch, edge traversal, read/wait/command and acks are real.
    const dependencies = [
      {
        find: async ({ where }) => nodes.filter((node) => node.type === where.type),
        findOne: async ({ where }) => nodes.find((node) => node.id === where.id),
      },
      {
        find: async ({ where }) =>
          edges.filter(
            (edge) => edge.source === where.source && (!where.sourceHandle || edge.sourceHandle === where.sourceHandle),
          ),
      },
      { findOne: async () => ({ id: 1, name: 'Fixture resource', metadata: {} }) },
      { record: (log: Log) => logs.push(log) },
      {},
      {},
      {},
      new EventEmitter2(),
      {},
      { getAll: async () => ({ resource: {}, global: {} }) },
      { time: (_name, run) => run() },
      { timeFlow: (_name, run) => run(), timeNode: (_name, run) => run() },
      {},
      {},
    ] as unknown as ConstructorParameters<typeof ResourceFlowsExecutorService>;
    const executor = new ResourceFlowsExecutorService(...dependencies);
    await backend.onApplicationBootstrap();
    await flow.onModuleInit();
    const transport: Transport = {
      publish: async (topic, payload, options) => {
        const publish = async () => {
          await deviceClient.publishAsync(topic, JSON.stringify(payload), { qos: 1, retain: options?.retain ?? false });
        };
        if (holdAcknowledgement && topic.endsWith('/acknowledgements')) {
          await new Promise<void>((resolve, reject) => {
            heldAcknowledgement = {
              topic,
              payload,
              release: async () => {
                try {
                  await publish();
                  resolve();
                } catch (error) {
                  reject(error);
                }
              },
            };
          });
        } else await publish();
      },
      subscribe: async (topic, listener) => {
        deviceClient.on('message', (received, payload) => {
          if (received === topic) Promise.resolve(listener(payload)).catch((error) => errors.push(error));
        });
        await deviceClient.subscribeAsync(topic, { qos: 1 });
      },
    };
    const store = new JsonStateStore(statePath);
    await store.save({ accepted: { revision: 1, contentHash: hash(snapshot), snapshot }, outputs: {}, commandIds: [] });
    runtime = new WagoRuntime({
      hardwareId,
      prefix,
      pairingCode: 'fixture-only',
      store,
      transport,
      device: new ModbusDeviceRouter(new Cc100OnboardIoAdapter({ input: din, output: dout })),
    });
    await runtime.start();
    await eventually(() =>
      expect(flow.payload(required(flow.read(query('input'))))).toMatchObject({ available: true, value: false }),
    );
  });

  afterAll(async () => {
    nodes.splice(0);
    holdAcknowledgement = false;
    await heldAcknowledgement?.release();
    flow?.onModuleDestroy();
    backend?.onModuleDestroy();
    await Promise.all([deviceClient, backendClient, observer].filter(Boolean).map((client) => client.endAsync(true)));
    for (const socket of sockets) socket.destroy();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (database?.isInitialized) await database.destroy();
    jest.restoreAllMocks();
  });

  function graph(id: string, source: string, category: string, equals: boolean | number, output: string) {
    const definitions = [
      ['event-received', { ...query(source, category), minimumIntervalMs: 60_000 }],
      ['read-state', query(source, category)],
      ['wait-for-state', { ...query(source, category), equals, timeoutMs: 4000 }],
      [
        'command',
        {
          controllerId,
          channelId: output,
          action: 'set',
          value: true,
          expectedConfigurationRevision: 1,
          completionBehavior: 'acknowledged',
          acknowledgementTimeoutSeconds: 5,
          failureBehavior: 'fail-flow',
        },
      ],
    ] as const;
    definitions.forEach(([type, data], index) => {
      nodes.push(
        Object.assign(new ResourceFlowNode(), {
          id: `${id}-${index}`,
          type: `plugin.wago.${type}`,
          resourceId: 1,
          data,
          position: { x: index * 100, y: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      if (index)
        edges.push({
          source: `${id}-${index - 1}`,
          target: `${id}-${index}`,
          sourceHandle: 'output',
        } as ResourceFlowEdge);
    });
  }

  it('routes canonical DI1 through the production graph and waits for the correlated production acknowledgement', async () => {
    graph('input', 'input', 'state', true, 'input-load');
    holdAcknowledgement = true;
    await writeFile(din, '1');
    await runtime.pollInputs();
    await eventually(() => expect(heldAcknowledgement).toBeDefined());
    const command = required(wire('commands').at(-1));
    expect(command.body).toMatchObject({ channelId: 'input-load', value: true, expectedConfigurationRevision: 1 });
    expect(Date.parse(command.body.expiresAt)).toBeGreaterThan(Date.now());
    expect((required(heldAcknowledgement).payload as Record<string, unknown>).id).toBe(command.body.id);
    expect(await readFile(dout, 'utf8')).toBe('9');
    expect(completed('input-1').at(-1)?.payload?.().output.wago).toMatchObject({ value: true, available: true });
    expect(completed('input-2').at(-1)?.payload?.().output.wago).toMatchObject({ value: true, available: true });
    expect(completed('input-3')).toHaveLength(0);
    // A wrong ID traverses RabbitMQ/backend but must not finish the command node.
    const wrongId = randomUUID();
    await observer.publishAsync(
      `${base}/acknowledgements`,
      JSON.stringify({ ...(required(heldAcknowledgement).payload as object), id: wrongId }),
      { qos: 1 },
    );
    await eventually(() => expect(processedAcknowledgements.has(wrongId)).toBe(true));
    // Drain promise continuations from the processed acknowledgement, including
    // command-node completion, without a timing-based negative assertion window.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(completed('input-3')).toHaveLength(0);
    holdAcknowledgement = false;
    await required(heldAcknowledgement).release();
    heldAcknowledgement = undefined;
    await eventually(() => expect(completed('input-3').length).toBeGreaterThan(0));
    const state = required(wire('state').find((message) => message.body.inputs?.input === true));
    expect(parseOperationalMessage(prefix, state.topic, state.payload)).toMatchObject({
      hardwareId,
      message: { category: 'state', inputs: { input: true }, revision: 1, contentHash: hash(snapshot) },
    });
    expect(
      wire('acknowledgements').some(
        (message) => message.body.id === command.body.id && message.body.status === 'accepted',
      ),
    ).toBe(true);
    // Stop matching subsequent full snapshots before building the meter graph.
    nodes.splice(0);
    edges.splice(0);
    expect(errors).toEqual([]);
  });

  it('acquires fractional Modbus power, reads then asynchronously waits in the real graph, and writes DO2', async () => {
    graph('meter', 'power', 'measurement', 13625, 'meter-load');
    await runtime.publishMeasurements();
    await eventually(() => expect(completed('meter-1')).toHaveLength(1));
    const first = required(wire('measurements').at(-1));
    expect(first.body).toMatchObject({ channelId: 'power', value: 12375, unit: 'milliwatt', kind: 'live' });
    expect(parseOperationalMessage(prefix, first.topic, first.payload)).toMatchObject({
      hardwareId,
      message: { category: 'measurement', value: 12375, unit: 'milliwatt', kind: 'live' },
    });
    expect(completed('meter-1')[0].payload?.().output.wago).toMatchObject({ value: 12375, available: true });
    expect(completed('meter-2')).toHaveLength(0);
    const before = wire('commands').length;
    expect(await readFile(dout, 'utf8')).toBe('9');
    modbusRaw = 13.625;
    await delay(110); // Cross the actual adapter poll interval, not a mocked clock.
    await runtime.publishMeasurements();
    await eventually(() => expect(completed('meter-3').length).toBeGreaterThan(0));
    expect(modbusRequests).toHaveLength(2);
    expect(required(wire('measurements').at(-1)).body).toMatchObject({
      value: 13625,
      unit: 'milliwatt',
      streamId: first.body.streamId,
    });
    expect(required(wire('measurements').at(-1)).body.sequence).toBeGreaterThan(first.body.sequence);
    expect(wire('commands').length).toBeGreaterThan(before);
    expect(await readFile(dout, 'utf8')).toBe('11'); // DO1 + DO2, preserving DO4.
    const command = required(wire('commands').find((message) => message.body.channelId === 'meter-load'));
    expect(
      wire('acknowledgements').some(
        (message) => message.body.id === command.body.id && message.body.status === 'accepted',
      ),
    ).toBe(true);
    nodes.splice(0);
    edges.splice(0);
    await eventually(() =>
      expect(flow.payload(required(flow.read(query('meter-load'))))).toMatchObject({ value: true, available: true }),
    );
    expect(errors).toEqual([]);
  });

  it('rejects captured duplicate/out-of-order telemetry and deduplicates an actual command without rewriting its output', async () => {
    await delay(100); // Let already-running graph dispatches finish.
    graph('replay', 'power', 'measurement', 13625, 'meter-load');
    const latest = required(flow.read(query('power', 'measurement')));
    const measurements = wire('measurements');
    const starts = logs.filter((log) => log.type === 'flow.start').length;
    const commands = wire('commands').length;
    const warningsBefore = warnings.length;
    for (const message of [required(measurements.at(-1)), measurements[0]])
      await observer.publishAsync(message.topic, message.payload, { qos: 1 });
    await eventually(() =>
      expect(
        warnings.slice(warningsBefore).filter((message) => message.includes('duplicate or out-of-order')).length,
      ).toBeGreaterThanOrEqual(2),
    );
    expect(flow.read(query('power', 'measurement'))).toBe(latest);
    expect(logs.filter((log) => log.type === 'flow.start')).toHaveLength(starts);
    expect(wire('commands')).toHaveLength(commands);
    nodes.splice(0);
    edges.splice(0);
    const command = required(wire('commands').find((message) => message.body.channelId === 'meter-load'));
    // External fixture reset makes a repeated physical write observable.
    await writeFile(dout, '9');
    await observer.publishAsync(command.topic, command.payload, { qos: 1 });
    await eventually(() =>
      expect(
        wire('acknowledgements').some(
          (message) => message.body.id === command.body.id && message.body.status === 'duplicate',
        ),
      ).toBe(true),
    );
    expect(await readFile(dout, 'utf8')).toBe('9');
    expect(JSON.parse(await readFile(statePath, 'utf8')).commandIds).toContain(command.body.id);
    expect(errors).toEqual([]);
  });

  it.each(['expired', 'wrong-revision'])(
    'rejects %s commands on the real runtime without changing packed output',
    async (reason) => {
      const command = {
        id: randomUUID(),
        channelId: 'meter-load',
        action: 'set',
        value: true,
        expectedConfigurationRevision: reason === 'wrong-revision' ? 2 : 1,
        expiresAt: new Date(Date.now() + (reason === 'expired' ? -1000 : 60_000)).toISOString(),
      };
      const before = await readFile(dout, 'utf8');
      await observer.publishAsync(`${base}/commands`, JSON.stringify(command), { qos: 1 });
      await eventually(() =>
        expect(
          wire('acknowledgements').some(
            (message) => message.body.id === command.id && message.body.status === 'rejected',
          ),
        ).toBe(true),
      );
      expect(await readFile(dout, 'utf8')).toBe(before);
      expect(errors).toEqual([]);
    },
  );

  it('marks unchanged production samples stale and refuses to satisfy a wait after their freshness window', async () => {
    const sample = required(flow.read(query('power', 'measurement')));
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 90_001);
    try {
      expect(flow.payload(sample)).toMatchObject({ available: false, stale: true, connectionStale: true });
      await expect(flow.wait({ ...query('power', 'measurement'), equals: 13625, timeoutMs: 30 })).resolves.toBeNull();
    } finally {
      clock.mockRestore();
    }
    expect(errors).toEqual([]);
  });
});
