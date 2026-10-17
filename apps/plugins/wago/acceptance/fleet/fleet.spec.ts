/* eslint-disable @nx/enforce-module-boundaries -- Acceptance deliberately connects the standalone runtime, plugin and real host graph executor. */
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import 'reflect-metadata';
import { parseOperationalMessage } from '../../backend/protocol';
import { hash, JsonStateStore, WagoRuntime, type Transport } from '../../cc100-runtime/src/runtime';
import {
  FleetFixtureState,
  base,
  delay,
  eventually,
  hardwareId,
  prefix,
  required,
  Log,
  prepareFleetHardware,
} from './fixture.test-utils';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { connectAsync } from 'mqtt';
import { DataSource } from 'typeorm';
import { registerPluginFlowNodes } from '../../../../api/src/plugin-system/flows/node-registry';
import { ResourceFlowsExecutorService } from '../../../../api/src/resources/flows/execution/resource-flows-executor.service';
import plugin from '../../backend/plugin';
import { WagoConfigurationRevision } from '../../backend/configuration/revision.entity';
import { WagoController } from '../../backend/controllers/entity';
import { WagoFlowService } from '../../backend/flow/service';
import { WagoSettings } from '../../backend/controllers/settings.entity';
import { WagoService } from '../../backend/controllers/service';
import { Cc100OnboardIoAdapter } from '../../cc100-runtime/src/io/adapters';
import { ModbusDeviceRouter } from '../../cc100-runtime/src/modbus/routing/adapter';

describe('production fleet acceptance — RabbitMQ / packed-register / Modbus TCP fixtures, NOT hardware qualification', () => {
  const state = new FleetFixtureState();
  beforeAll(async () => {
    const url = await prepareFleetHardware(state);
    state.database = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: plugin.entities,
      synchronize: true,
    });
    await state.database.initialize();
    const now = new Date().toISOString();
    const controller = await state.database.getRepository(WagoController).save({
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
    state.controllerId = controller.id;
    await state.database.getRepository(WagoSettings).save({ id: 1, defaultMqttServerId: 1, operationalPrefix: prefix });
    await state.database.getRepository(WagoConfigurationRevision).save({
      controllerId: state.controllerId,
      revision: 1,
      contentHash: hash(state.snapshot),
      snapshot: JSON.stringify(state.snapshot),
      state: 'applied',
      publishedAt: now,
    });
    const mqttOptions = {
      username: 'fixture',
      password: process.env.WAGO_FLEET_MQTT_PASSWORD,
      reconnectPeriod: 0,
      connectTimeout: 5000,
    };
    state.deviceClient = await connectAsync(url, { ...mqttOptions, clientId: `device-${randomUUID()}` });
    state.backendClient = await connectAsync(url, { ...mqttOptions, clientId: `backend-${randomUUID()}` });
    state.observer = await connectAsync(url, { ...mqttOptions, clientId: `observer-${randomUUID()}` });
    for (const client of [state.deviceClient, state.backendClient, state.observer])
      client.on('error', (error) => state.errors.push(error));
    state.observer.on('message', (topic, payload) =>
      state.messages.push({ topic, payload, body: JSON.parse(payload.toString()) }),
    );
    await state.observer.subscribeAsync(`${base}/#`, { qos: 1 });
    const context = {
      getRepository: (entity) => state.database.getRepository(entity),
      get: (service) => {
        if (service === WagoService) return state.backend;
        throw new Error(`Unexpected service lookup: ${service.name}`);
      },
      logger: { warn: (message: string) => state.warnings.push(message) },
      mqtt: {
        publish: async (_server, topic, payload, options) => {
          await state.backendClient.publishAsync(topic, payload, options);
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
                    state.processedAcknowledgements.add(JSON.parse(payload.toString()).id);
                })
                .catch((error) => state.errors.push(error));
          };
          state.backendClient.on('message', handler);
          await state.backendClient.subscribeAsync(filter, { qos: 1 });
          return { unsubscribe: () => state.backendClient.off('message', handler) };
        },
      },
      // This is the real host SDK forwarding boundary, not a test flow callback.
      flows: { trigger: (type, matches, payload) => executor.triggerPluginFlows('wago', type, matches, payload) },
    } as unknown as PluginContext;
    state.backend = new WagoService(context);
    state.flow = new WagoFlowService(context);
    const module = plugin.register(context);
    // The plugin binds its flow node factories through the 'wago-flow-services' factory
    // provider when Nest initialises the module. Invoke it the same way with the real
    // service instances so plugin.flowNodes(context) resolves against the production graph.
    const binding = (module.providers ?? []).find(
      (provider) => typeof provider === 'object' && 'provide' in provider && provider.provide === 'wago-flow-services',
    );
    if (!binding || typeof binding !== 'object' || !('useFactory' in binding))
      throw new Error('Missing production flow services binding');
    const bound = (binding.useFactory as (command: WagoService, state: WagoFlowService) => { onModuleDestroy(): void })(
      state.backend,
      state.flow,
    );
    state.flowBinding = bound;
    if (typeof plugin.flowNodes !== 'function') throw new Error('Missing production node factory');
    registerPluginFlowNodes('wago', plugin.flowNodes(context));
    // Only host persistence for the saved graph and unrelated application services
    // are fixtures. Node dispatch, edge traversal, read/wait/command and acks are real.
    const dependencies = [
      {
        find: async ({ where }) => state.nodes.filter((node) => node.type === where.type),
        findOne: async ({ where }) => state.nodes.find((node) => node.id === where.id),
      },
      {
        find: async ({ where }) =>
          state.edges.filter(
            (edge) => edge.source === where.source && (!where.sourceHandle || edge.sourceHandle === where.sourceHandle),
          ),
      },
      { findOne: async () => ({ id: 1, name: 'Fixture resource', metadata: {} }) },
      { record: (log: Log) => state.logs.push(log) },
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
    await state.backend.onApplicationBootstrap();
    await state.flow.onModuleInit();
    const transport: Transport = {
      publish: async (topic, payload, options) => {
        const publish = async () => {
          await state.deviceClient.publishAsync(topic, JSON.stringify(payload), {
            qos: 1,
            retain: options?.retain ?? false,
          });
        };
        if (state.holdAcknowledgement && topic.endsWith('/acknowledgements')) {
          await new Promise<void>((resolve, reject) => {
            state.heldAcknowledgement = {
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
        state.deviceClient.on('message', (received, payload) => {
          if (received === topic) Promise.resolve(listener(payload)).catch((error) => state.errors.push(error));
        });
        await state.deviceClient.subscribeAsync(topic, { qos: 1 });
      },
    };
    const store = new JsonStateStore(state.statePath);
    await store.save({
      accepted: { revision: 1, contentHash: hash(state.snapshot), snapshot: state.snapshot },
      outputs: {},
      commandIds: [],
    });
    state.runtime = new WagoRuntime({
      hardwareId,
      prefix,
      pairingCode: 'fixture-only',
      store,
      transport,
      device: new ModbusDeviceRouter(new Cc100OnboardIoAdapter({ input: state.din, output: state.dout })),
    });
    await state.runtime.start();
    await eventually(() =>
      expect(state.flow.payload(required(state.flow.read(state.query('input'))))).toMatchObject({
        available: true,
        value: false,
      }),
    );
  });

  afterAll(async () => {
    state.nodes.splice(0);
    state.holdAcknowledgement = false;
    await state.heldAcknowledgement?.release();
    state.flow?.onModuleDestroy();
    state.backend?.onModuleDestroy();
    state.flowBinding?.onModuleDestroy();
    state.flowBinding = undefined;
    await Promise.all(
      [state.deviceClient, state.backendClient, state.observer].filter(Boolean).map((client) => client.endAsync(true)),
    );
    for (const socket of state.sockets) socket.destroy();
    if (state.server) await new Promise<void>((resolve) => state.server.close(() => resolve()));
    if (state.database?.isInitialized) await state.database.destroy();
    jest.restoreAllMocks();
  });
  it('routes canonical DI1 through the production graph and waits for the correlated production acknowledgement', async () => {
    state.graph('input', 'input', 'state', true, 'input-load');
    state.holdAcknowledgement = true;
    await writeFile(state.din, '1');
    await state.runtime.pollInputs();
    await eventually(() => expect(state.heldAcknowledgement).toBeDefined());
    const command = required(state.wire('commands').at(-1));
    expect(command.body).toMatchObject({ channelId: 'input-load', value: true, expectedConfigurationRevision: 1 });
    expect(Date.parse(command.body.expiresAt)).toBeGreaterThan(Date.now());
    expect((required(state.heldAcknowledgement).payload as Record<string, unknown>).id).toBe(command.body.id);
    expect(await readFile(state.dout, 'utf8')).toBe('9');
    expect(state.completed('input-1').at(-1)?.payload?.().output.wago).toMatchObject({ value: true, available: true });
    expect(state.completed('input-2').at(-1)?.payload?.().output.wago).toMatchObject({ value: true, available: true });
    expect(state.completed('input-3')).toHaveLength(0);
    // A wrong ID traverses RabbitMQ/backend but must not finish the command node.
    const wrongId = randomUUID();
    await state.observer.publishAsync(
      `${base}/acknowledgements`,
      JSON.stringify({ ...(required(state.heldAcknowledgement).payload as object), id: wrongId }),
      { qos: 1 },
    );
    await eventually(() => expect(state.processedAcknowledgements.has(wrongId)).toBe(true));
    // Drain promise continuations from the processed acknowledgement, including
    // command-node completion, without a timing-based negative assertion window.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(state.completed('input-3')).toHaveLength(0);
    state.holdAcknowledgement = false;
    await required(state.heldAcknowledgement).release();
    state.heldAcknowledgement = undefined;
    await eventually(() => expect(state.completed('input-3').length).toBeGreaterThan(0));
    const stateMessage = required(state.wire('state').find((message) => message.body.inputs?.input === true));
    expect(parseOperationalMessage(prefix, stateMessage.topic, stateMessage.payload)).toMatchObject({
      hardwareId: hardwareId,
      message: { category: 'state', inputs: { input: true }, revision: 1, contentHash: hash(state.snapshot) },
    });
    expect(
      state
        .wire('acknowledgements')
        .some((message) => message.body.id === command.body.id && message.body.status === 'accepted'),
    ).toBe(true);
    // Stop matching subsequent full snapshots before building the meter graph.
    state.nodes.splice(0);
    state.edges.splice(0);
    expect(state.errors).toEqual([]);
  });

  it('acquires fractional Modbus power, reads then asynchronously waits in the real graph, and writes DO2', async () => {
    state.graph('meter', 'power', 'measurement', 13625, 'meter-load');
    await state.runtime.publishMeasurements();
    await eventually(() => expect(state.completed('meter-1')).toHaveLength(1));
    const first = required(state.wire('measurements').at(-1));
    expect(first.body).toMatchObject({ channelId: 'power', value: 12375, unit: 'milliwatt', kind: 'live' });
    expect(parseOperationalMessage(prefix, first.topic, first.payload)).toMatchObject({
      hardwareId: hardwareId,
      message: { category: 'measurement', value: 12375, unit: 'milliwatt', kind: 'live' },
    });
    expect(state.completed('meter-1')[0].payload?.().output.wago).toMatchObject({ value: 12375, available: true });
    expect(state.completed('meter-2')).toHaveLength(0);
    const before = state.wire('commands').length;
    expect(await readFile(state.dout, 'utf8')).toBe('9');
    state.modbusRaw = 13.625;
    await delay(110); // Cross the actual adapter poll interval, not a mocked clock.
    await state.runtime.publishMeasurements();
    await eventually(() => expect(state.completed('meter-3').length).toBeGreaterThan(0));
    expect(state.modbusRequests).toHaveLength(2);
    expect(required(state.wire('measurements').at(-1)).body).toMatchObject({
      value: 13625,
      unit: 'milliwatt',
      streamId: first.body.streamId,
    });
    expect(required(state.wire('measurements').at(-1)).body.sequence).toBeGreaterThan(first.body.sequence);
    expect(state.wire('commands').length).toBeGreaterThan(before);
    expect(await readFile(state.dout, 'utf8')).toBe('11'); // DO1 + DO2, preserving DO4.
    const command = required(state.wire('commands').find((message) => message.body.channelId === 'meter-load'));
    expect(
      state
        .wire('acknowledgements')
        .some((message) => message.body.id === command.body.id && message.body.status === 'accepted'),
    ).toBe(true);
    state.nodes.splice(0);
    state.edges.splice(0);
    await eventually(() =>
      expect(state.flow.payload(required(state.flow.read(state.query('meter-load'))))).toMatchObject({
        value: true,
        available: true,
      }),
    );
    expect(state.errors).toEqual([]);
  });

  it('rejects captured duplicate/out-of-order telemetry and deduplicates an actual command without rewriting its output', async () => {
    await delay(100); // Let already-running graph dispatches finish.
    state.graph('replay', 'power', 'measurement', 13625, 'meter-load');
    const latest = required(state.flow.read(state.query('power', 'measurement')));
    const measurements = state.wire('measurements');
    const starts = state.logs.filter((log) => log.type === 'flow.start').length;
    const commands = state.wire('commands').length;
    const warningsBefore = state.warnings.length;
    for (const message of [required(measurements.at(-1)), measurements[0]])
      await state.observer.publishAsync(message.topic, message.payload, { qos: 1 });
    await eventually(() =>
      expect(
        state.warnings.slice(warningsBefore).filter((message) => message.includes('duplicate or out-of-order')).length,
      ).toBeGreaterThanOrEqual(2),
    );
    expect(state.flow.read(state.query('power', 'measurement'))).toBe(latest);
    expect(state.logs.filter((log) => log.type === 'flow.start')).toHaveLength(starts);
    expect(state.wire('commands')).toHaveLength(commands);
    state.nodes.splice(0);
    state.edges.splice(0);
    const command = required(state.wire('commands').find((message) => message.body.channelId === 'meter-load'));
    // External fixture reset makes a repeated physical write observable.
    await writeFile(state.dout, '9');
    await state.observer.publishAsync(command.topic, command.payload, { qos: 1 });
    await eventually(() =>
      expect(
        state
          .wire('acknowledgements')
          .some((message) => message.body.id === command.body.id && message.body.status === 'duplicate'),
      ).toBe(true),
    );
    expect(await readFile(state.dout, 'utf8')).toBe('9');
    expect(JSON.parse(await readFile(state.statePath, 'utf8')).commandIds).toContain(command.body.id);
    expect(state.errors).toEqual([]);
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
      const before = await readFile(state.dout, 'utf8');
      await state.observer.publishAsync(`${base}/commands`, JSON.stringify(command), { qos: 1 });
      await eventually(() =>
        expect(
          state
            .wire('acknowledgements')
            .some((message) => message.body.id === command.id && message.body.status === 'rejected'),
        ).toBe(true),
      );
      expect(await readFile(state.dout, 'utf8')).toBe(before);
      expect(state.errors).toEqual([]);
    },
  );

  it('marks unchanged production samples stale and refuses to satisfy a wait after their freshness window', async () => {
    const sample = required(state.flow.read(state.query('power', 'measurement')));
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 90_001);
    try {
      expect(state.flow.payload(sample)).toMatchObject({ available: false, stale: true, connectionStale: true });
      await expect(
        state.flow.wait({ ...state.query('power', 'measurement'), equals: 13625, timeoutMs: 30 }),
      ).resolves.toBeNull();
    } finally {
      clock.mockRestore();
    }
    expect(state.errors).toEqual([]);
  });
});
