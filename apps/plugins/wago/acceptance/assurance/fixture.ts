/* eslint-disable @nx/enforce-module-boundaries -- Owned integration fixture composes real plugin, runtime and credential provider. */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { connectAsync, type MqttClient } from 'mqtt';
import { DataSource } from 'typeorm';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { RabbitmqCredentialProvisioningProvider } from '../../../rabbitmq/backend/credentials/provider';
import { WagoService } from '../../backend/controllers/service';
import { WagoController } from '../../backend/controllers/entity';
import { WagoSettings } from '../../backend/controllers/settings.entity';
import { WagoConfigurationRevision } from '../../backend/configuration/revision.entity';
import { parseOperationalMessage } from '../../backend/protocol/index';
import plugin from '../../backend/plugin';
import { MemoryDeviceAdapter } from '../../cc100-runtime/src/io/adapters';
import { WagoRuntime, JsonStateStore, hash, type Snapshot } from '../../cc100-runtime/src/runtime';
import { isIdentifier } from '../../shared/protocol-limits';
import { MqttTransport } from '../../cc100-runtime/src/transport/mqtt';

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export async function eventually(check: () => boolean | Promise<boolean>, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(20);
  }
  throw new Error('Fresh authenticated operation did not resume before timeout');
}
export const snapshot: Snapshot = {
  version: 1,
  physicalPoints: [
    { id: 'out', hardwareProfile: '751-9301', channel: 0 },
    { id: 'other', hardwareProfile: '751-9301', channel: 1 },
  ],
  logicalChannels: ['out', 'other'].map((id) => ({
    id,
    physicalPointId: id,
    profile: 'generic-digital-output',
    capabilities: ['output'],
    disconnectPolicy: { mode: 'hold' },
  })),
};
export type Device = {
  id: number;
  hardwareId: string;
  username: string;
  password: string;
  client: MqttClient;
  runtime: WagoRuntime;
  adapter: MemoryDeviceAdapter;
  store: JsonStateStore;
  transport: MqttTransport;
  connectMs: number;
};
export class AssuranceFixture {
  readonly prefix = `assurance/${randomUUID()}`;
  readonly clients = new Set<MqttClient>();
  readonly devices: Device[] = [];
  readonly counts = {
    received: 0,
    processed: 0,
    rejected: 0,
    protocolRejected: 0,
    diagnosticsRejected: 0,
    duplicate: 0,
    gaps: 0,
    intentionalDiscard: 0,
    commandPublished: 0,
    runtimeWrites: 0,
  };
  readonly sequences = new Map<string, number>();
  readonly backendSubscriptions = new Set<string>();
  readonly errors: string[] = [];
  retiredStaleDiscarded = 0;
  retiredWireRejected = 0;
  readonly retiredRuntimeRejected = { parsing: 0, structure: 0, validation: 0 };
  retiredTransportRejected = 0;
  retiredAcknowledgementTimeouts = 0;

  get transportAcknowledgementTimeouts() {
    return (
      this.retiredAcknowledgementTimeouts +
      this.devices.reduce((sum, device) => sum + device.transport.statistics.acknowledgementTimeouts, 0)
    );
  }
  readonly directory = process.env.WAGO_FLEET_TEMP ? join(process.env.WAGO_FLEET_TEMP, randomUUID()) : '';
  readonly url = process.env.WAGO_FLEET_MQTT_URL ?? '';
  readonly management = process.env.WAGO_FLEET_MANAGEMENT_URL ?? '';
  database!: DataSource;
  backend!: WagoService;
  backendClient!: MqttClient;
  provider!: RabbitmqCredentialProvisioningProvider;
  context!: PluginContext;

  async connect(username: string, password: string, reconnectPeriod = 0) {
    const client = await connectAsync(this.url, {
      username,
      password,
      reconnectPeriod,
      connectTimeout: 3000,
      clientId: `${username}-${randomUUID()}`,
      protocolVersion: 5,
    });
    this.clients.add(client);
    client.setMaxListeners(512); // At most 32 controllers, each with bounded exact-topic subscriptions.
    client.on('error', () => undefined); // Expected authorization/outage failures are asserted by their callers.
    return client;
  }

  async start(count: number) {
    if (
      !this.directory ||
      !/^mqtt:\/\/127\.0\.0\.1:\d+$/.test(this.url) ||
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(this.management)
    )
      throw new Error('Use the owned assurance runner');
    await mkdir(this.directory, { mode: 0o700 });
    this.database = new DataSource({
      type: 'sqlite',
      database: join(this.directory, 'database.sqlite'),
      entities: plugin.entities,
      synchronize: true,
    });
    await this.database.initialize();
    await this.database
      .getRepository(WagoSettings)
      .save({ id: 1, defaultMqttServerId: 1, operationalPrefix: this.prefix });
    this.backendClient = await this.connect('fixture', process.env.WAGO_FLEET_MQTT_PASSWORD ?? '', 100);
    const mqttPort = Number(new URL(this.url).port);
    this.context = {
      getRepository: (entity) => this.database.getRepository(entity),
      getMqttServerConfig: async () => ({
        id: 1,
        name: 'Owned fixture',
        host: '127.0.0.1',
        port: mqttPort,
        useTls: false,
        username: 'fixture',
        password: process.env.WAGO_FLEET_MQTT_PASSWORD,
        clientId: null,
      }),
      logger: { warn: () => undefined },
      mqtt: {
        publish: async (_server, topic, payload, options) => {
          await this.backendClient.publishAsync(topic, payload, options);
          if (topic.endsWith('/commands')) this.counts.commandPublished++;
        },
        subscribe: async (_server, filter, listener) => {
          const handler = (topic: string, payload: Buffer, packet: { retain: boolean }) => {
            const parts = topic.split('/');
            const matches = filter
              .split('/')
              .every((part: string, i: number) => part === '#' || part === '+' || part === parts[i]);
            if (!matches) return;
            try {
              Promise.resolve(listener({ serverId: 1, topic, payload, retain: packet.retain })).catch(() =>
                this.recordError('backend callback failed'),
              );
            } catch {
              this.recordError('backend callback failed');
            }
          };
          this.backendClient.on('message', handler);
          await this.backendClient.subscribeAsync(filter, { qos: 1 });
          this.backendSubscriptions.add(filter);
          return { unsubscribe: () => this.backendClient.off('message', handler) };
        },
      },
    } as unknown as PluginContext;
    this.provider = new RabbitmqCredentialProvisioningProvider(this.context);
    const managementClient = (this.provider as unknown as { client: { managementApiBase: () => string } }).client;
    managementClient.managementApiBase = () => this.management;
    this.backendClient.on('message', (topic, payload) => this.observeOperationalPacket(topic, payload));
    for (let i = 0; i < count; i++) {
      const hardwareId = `controller-${i}`;
      const username = `wago-${randomUUID()}`;
      const root = `${this.prefix}/v1/controllers/${hardwareId}`;
      const credential = await this.provider.provision({
        mqttServerId: 1,
        identity: username,
        username,
        vhost: '/',
        topicPolicy: {
          publish: ['heartbeat', 'state', 'measurements', 'faults', 'acknowledgements', 'configuration/reported'].map(
            (suffix) => `${root}/${suffix}`,
          ),
          subscribe: [`${root}/commands`, `${root}/configuration/desired`],
        },
      });
      const now = new Date().toISOString();
      const controller = await this.database.getRepository(WagoController).save({
        hardwareId,
        name: hardwareId,
        mqttServerId: 1,
        trustState: 'claimed',
        pairingCodeHash: 'fixture',
        protocolVersion: '1.0.0',
        runtimeVersion: '0.1.0',
        capabilities: JSON.stringify(['claim', 'heartbeat', 'configuration-v1']),
        lastSequence: 0,
        lastHeartbeatAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await this.database.getRepository(WagoConfigurationRevision).save({
        controllerId: controller.id,
        revision: 1,
        contentHash: hash(snapshot),
        snapshot: JSON.stringify(snapshot),
        state: 'applied',
        publishedAt: now,
      });
      const store = new JsonStateStore(join(this.directory, `${hardwareId}.json`));
      await store.save({
        credentials: { username, password: credential.password, prefix: this.prefix, credentialEpoch: randomUUID() },
        accepted: { revision: 1, contentHash: hash(snapshot), snapshot },
        outputs: { other: true },
        commandIds: [],
      });
      const device = { id: controller.id, hardwareId, username, password: credential.password, store } as Device;
      await this.startDevice(device);
      this.devices.push(device);
    }
    await this.startBackend();
    await this.fresh();
  }

  observeOperationalPacket(topic: string, payload: Buffer) {
    const root = `${this.prefix}/v1/controllers/`;
    if (!topic.startsWith(root)) return;
    const [hardwareId, suffix, extra] = topic.slice(root.length).split('/');
    if (
      !isIdentifier(hardwareId) ||
      extra !== undefined ||
      !['state', 'measurements', 'faults', 'acknowledgements'].includes(suffix)
    )
      return;
    this.counts.received++;
    try {
      const parsed = parseOperationalMessage(this.prefix, topic, payload);
      if (!parsed) return;
      const key = `${parsed.hardwareId}/${parsed.message.streamId}/${parsed.message.category}`;
      const previous = this.sequences.get(key) ?? 0;
      if (parsed.message.sequence <= previous) this.counts.duplicate++;
      else {
        // Count only gaps between observed packets in one category/stream.
        // The first packet can start above one after a durable sequence reservation.
        if (previous > 0) this.counts.gaps += Math.max(0, parsed.message.sequence - previous - 1);
        this.sequences.set(key, parsed.message.sequence);
      }
    } catch {
      this.counts.protocolRejected++;
      this.counts.rejected++;
    }
  }

  recordError(message: string) {
    if (this.errors.length < 20) this.errors.push(message);
  }

  async startBackend() {
    if (this.backend) this.retiredWireRejected += this.backend.messageStatistics.rejected;
    this.backend = new WagoService(this.context);
    const ingest = this.backend.diagnostics.ingest.bind(this.backend.diagnostics);
    this.backend.diagnostics.ingest = (...args) => {
      const accepted = ingest(...args);
      if (accepted) this.counts.processed++;
      else {
        this.counts.diagnosticsRejected++;
        this.counts.rejected++;
      }
      return accepted;
    };
    await this.backend.onApplicationBootstrap();
  }

  async startDevice(device: Device) {
    if (device.transport) {
      this.retiredStaleDiscarded += device.transport.statistics.staleDiscarded;
      this.retiredTransportRejected += device.transport.statistics.oversizedRejected;
      this.retiredAcknowledgementTimeouts += device.transport.statistics.acknowledgementTimeouts;
    }
    if (device.runtime) {
      this.retiredWireRejected += device.runtime.messageStatistics.rejected;
      for (const reason of ['parsing', 'structure', 'validation'] as const)
        this.retiredRuntimeRejected[reason] += device.runtime.messageStatistics.runtimeRejected[reason];
    }
    const connectingAt = Date.now();
    device.client = await this.connect(device.username, device.password, 100);
    device.connectMs = Date.now() - connectingAt;
    device.adapter = new MemoryDeviceAdapter();
    const write = device.adapter.write.bind(device.adapter);
    device.adapter.write = async (...args) => {
      await write(...args);
      this.counts.runtimeWrites++;
    };
    device.transport = new MqttTransport(device.client, () => this.recordError('runtime callback failed'));
    device.runtime = new WagoRuntime({
      hardwareId: device.hardwareId,
      prefix: this.prefix,
      pairingCode: 'fixture',
      store: device.store,
      device: device.adapter,
      transport: device.transport,
    });
    await device.runtime.start();
  }

  async fresh() {
    // MQTT CONNECT can precede automatic resubscription acknowledgements. With
    // clean sessions, a one-shot heartbeat sent then can miss the backend.
    // Establish the receive boundary before generating recovery evidence.
    await this.backendClient.subscribeAsync(
      Object.assign(Object.fromEntries([...this.backendSubscriptions].map((filter) => [filter, { qos: 1 as const }])), {
        resubscribe: true,
      }),
    );
    const after = Date.now();
    await Promise.all(this.devices.map((device) => device.runtime.publishHeartbeat()));
    await eventually(() =>
      this.devices.every((device) => {
        const state = this.backend.diagnostics.read(device.id);
        return (
          Date.parse(state.heartbeatAt ?? '') >= after &&
          Date.parse(state.stateSourceAt ?? '') >= after &&
          state.connected === true &&
          state.revision === 1 &&
          state.contentHash === hash(snapshot) &&
          state.hardwareAvailable === true
        );
      }),
    ).catch(() => {
      throw new Error(
        `Fresh heartbeat missing: ${JSON.stringify({ after, backendConnected: this.backendClient.connected, devices: this.devices.map((d) => ({ id: d.id, connected: d.client.connected, heartbeat: this.backend.diagnostics.read(d.id).heartbeatAt })), counts: this.counts })}`,
      );
    });
  }

  async command(device: Device) {
    await this.backend.executeCommand({
      controllerId: device.id,
      channelId: 'out',
      action: 'set',
      value: false,
      expectedConfigurationRevision: 1,
      completionBehavior: 'acknowledged',
      acknowledgementTimeoutSeconds: 3,
    });
    expect((await device.store.load()).outputs.other).toBe(true);
  }

  async close() {
    this.backend?.onModuleDestroy();
    await Promise.all(
      [...this.clients].filter((client) => !client.disconnected).map((client) => client.endAsync(true)),
    );
    if (this.database?.isInitialized) await this.database.destroy();
  }
}
