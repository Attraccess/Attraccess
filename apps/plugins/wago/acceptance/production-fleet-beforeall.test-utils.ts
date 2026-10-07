import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { connectAsync } from 'mqtt';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { registerPluginFlowNodes } from '../../../api/src/plugin-system/plugin-flow-node-registry';
import { ResourceFlowsExecutorService } from '../../../api/src/resources/flows/resource-flows-executor.service';
import plugin from '../backend/plugin';
import { WagoConfigurationRevision } from '../backend/wago-configuration-revision.entity';
import { WagoController } from '../backend/wago-controller.entity';
import { WagoFlowService } from '../backend/wago-flow.service';
import { WagoSettings } from '../backend/wago-settings.entity';
import { WagoService } from '../backend/wago.service';
import { Cc100OnboardIoAdapter } from '../cc100-runtime/src/adapters';
import { ModbusDeviceRouter } from '../cc100-runtime/src/modbus/adapter';
import { hash, JsonStateStore, WagoRuntime, type Transport } from '../cc100-runtime/src/runtime';
import { base, eventually, hardwareId, Log, prefix, required } from './production-fleet-globals.test-utils';

import { prepareFleetHardware } from './fleet-hardware-fixture.test-utils';
import { FleetFixtureState } from './production-fleet-fixture.test-utils';
export async function FleetBeforeAll(state: FleetFixtureState): Promise<void> {
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
}
