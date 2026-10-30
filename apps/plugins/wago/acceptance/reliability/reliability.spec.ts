/**
 * Reliability harness. The real WagoService and WagoFlowService run on the host's real MqttClientService and
 * PluginMqttService against a runner-owned RabbitMQ 4 broker. The host's server record (QoS 0 defaults),
 * encryption, metrics and timer are stubbed, and so are the plugin context parts that need the rest of the host:
 * audit records, secret encryption, MQTT credential provisioning, the flow trigger, and the flow-node query (no
 * saved flows). Commands enter through the plugin's real flow command node. Simulated controllers live in a
 * separate process.
 *
 * SIMULATOR MEASUREMENT: nothing here is evidence about physical CC100 hardware.
 */
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type ChildProcess, execFile, fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import 'reflect-metadata';
import { connectAsync, type MqttClient } from 'mqtt';
import { DataSource } from 'typeorm';
import { MqttClientService } from '../../../../api/src/mqtt/mqtt-client.service';
import { PluginMqttService } from '../../../../api/src/plugin-system/plugin-mqtt.service';
import { WagoConfigurationRevision } from '../../backend/configuration/revision.entity';
import { WagoController } from '../../backend/controllers/entity';
import { WagoService } from '../../backend/controllers/service';
import { WagoSettings } from '../../backend/controllers/settings.entity';
import { WagoCredentialRotationService } from '../../backend/credentials/service';
import { WagoFlowService } from '../../backend/flow/service';
import { WAGO_COMMAND_NODE_TYPE, createWagoCommandNode } from '../../backend/flow/command-node';
import plugin from '../../backend/plugin';
import { WagoCommandError } from '../../backend/commands/handler';
import { hash, type Snapshot } from '../../cc100-runtime/src/runtime';
import type { CommandRecord, ControllerSnapshot, FarmRequest } from './controller-farm.test-utils';
import {
  BROKER_OUTAGE_MS,
  CREDENTIAL_EPOCH,
  SHORT_MODE,
  SWEEP_STEPS,
  SWEEP_STEP_MS,
  acceptableValues,
  hardwareId,
  harnessErrors,
  percentile,
  publishedLimits,
  shortModeFailures,
  shortModeNotes,
  stepPasses,
  totalsFromResults,
  type CommandResult,
  type Failure,
  type FailureResult,
  type StepResult,
} from './plan';

const exec = promisify(execFile);
const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Run node apps/plugins/wago/scripts/test-reliability.mjs; ${name} is missing`);
  return value;
};
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const mode = env('WAGO_RELIABILITY_MODE') === 'sweep' ? 'sweep' : 'short';
const [brokerHost, brokerPort] = env('WAGO_RELIABILITY_MQTT_URL').replace('mqtt://', '').split(':');
const password = env('WAGO_RELIABILITY_MQTT_PASSWORD');
const directory = env('WAGO_RELIABILITY_DIRECTORY');
const container = env('WAGO_RELIABILITY_CONTAINER');
const dockerContext = env('WAGO_RELIABILITY_DOCKER_CONTEXT');
const docker = (...args: string[]) => exec('docker', ['--context', dockerContext, ...args], { timeout: 120_000 });

const snapshot: Snapshot = {
  version: 1,
  physicalPoints: [
    { id: 'do1', hardwareProfile: '751-9301', channel: 0 },
    { id: 'do2', hardwareProfile: '751-9301', channel: 1 },
  ],
  logicalChannels: ['a', 'b'].map((suffix, index) => ({
    id: `out-${suffix}`,
    physicalPointId: `do${index + 1}`,
    profile: 'generic-digital-output',
    capabilities: ['output'],
    disconnectPolicy: { mode: 'hold' as const },
  })),
};
const CHANNELS = snapshot.logicalChannels.map((channel) => channel.id);

type Host = {
  database: DataSource;
  mqtt: MqttClientService;
  pluginMqtt: PluginMqttService;
  wago: WagoService;
  flow: WagoFlowService;
  rotation: WagoCredentialRotationService;
  execute: (config: Record<string, unknown>) => Promise<void>;
  diagnostics: (controllerId: number) => {
    outputs: Record<string, { value: boolean; sourceAt: string | null }>;
    activeStream?: string;
  };
  destroy: () => void;
};

describe(`WAGO reliability harness (${mode} mode) - simulator measurement, NOT hardware qualification`, () => {
  let prefix: string;
  let count: number;
  let rate: number;
  let host: Host | undefined;
  let farm: ChildProcess | undefined;
  let admin: MqttClient;
  let nextRequest = 0;
  const pendingRequests = new Map<number, (value: Record<string, unknown>) => void>();
  const results: CommandResult[] = [];
  const failures: FailureResult[] = [];
  let hostQueueOverflows = 0;
  let failureActive = false;
  let paused = false;
  /** Commands sent by the driver that have not settled yet. */
  let inFlight = 0;
  /** Commands the injectors published directly, with their outcome read from the controller records. */
  const injectedCommands: CommandResult[] = [];
  let driver: NodeJS.Timeout[] = [];
  const toggles: boolean[] = [];
  const reported: Array<{ topic: string; body: { revision: number; errors: Array<{ code: string }> } }> = [];

  const topic = (index: number, suffix: string) => `${prefix}/v1/controllers/${hardwareId(index)}/${suffix}`;

  // --- host ---------------------------------------------------------------------------------------
  async function startHost(database: DataSource): Promise<Host> {
    const events = new EventEmitter2();
    const server = {
      id: 1,
      name: 'reliability',
      host: brokerHost,
      port: Number(brokerPort),
      useTls: false,
      username: 'fixture',
      password,
      clientId: `host-${randomUUID()}`,
      defaultPublishQos: 0,
      defaultSubscribeQos: 0,
      defaultPublishRetain: false,
    };
    const mqtt = new MqttClientService(
      { findOneBy: async () => server, update: async () => undefined } as never,
      events,
      { isEncrypted: () => false, encrypt: (value: string) => value, decrypt: (value: string) => value } as never,
      { mqttServersHealthy: { set: () => undefined } } as never,
      { time: (_target: string, _operation: string, run: () => Promise<unknown>) => run() } as never,
    );
    const pluginMqtt = new PluginMqttService(mqtt, events);
    const logger = {
      log: () => undefined,
      debug: () => undefined,
      verbose: () => undefined,
      error: () => undefined,
      warn: (message: string) => {
        // The host logs once per overflow episode, not once per dropped message.
        if (/dropping new messages/.test(message)) hostQueueOverflows += 1;
      },
    };
    const flowQuery = {
      select: () => flowQuery,
      where: () => flowQuery,
      andWhere: () => flowQuery,
      getMany: async () => [],
    };
    const context = {
      getRepository: (entity: never) => database.getRepository(entity),
      dataSource: { getRepository: () => ({ createQueryBuilder: () => flowQuery }) },
      logger,
      flows: { trigger: async () => undefined },
      audit: { record: async () => ({ status: 'recorded' }) },
      secrets: { encrypt: (value: string) => `enc:${value}`, decrypt: (value: string) => value.slice(4) },
      getMqttCredentialProvisioning: () => ({
        // The broker password is deliberately unchanged: this exercises the handoff, persistence and reconnect.
        rotate: async (request: { identity: string }) => ({
          providerId: 'reliability',
          identity: request.identity,
          username: request.identity,
          password: `rotated-${randomUUID()}`,
          vhost: '/',
        }),
      }),
      mqtt: {
        publish: (serverId: number, target: string, payload: string | Buffer, options?: { qos?: 0 | 1 | 2 }) =>
          pluginMqtt.publish(serverId, target, payload, options),
        subscribe: (serverId: number, filter: string, handler: never) =>
          pluginMqtt.subscribe('wago', 'wago', logger, serverId, filter, handler),
      },
    } as unknown as PluginContext;
    const wago = new WagoService(context);
    const flow = new WagoFlowService(context, wago);
    await wago.onApplicationBootstrap();
    await flow.onModuleInit();
    const rotation = new WagoCredentialRotationService(context);
    // The node a saved flow runs; the plugin registers the same definition bound to the same WagoService.
    const commandNode = createWagoCommandNode(() => wago);
    const diagnostics = Reflect.get(wago, 'diagnostics') as { read: Host['diagnostics'] };
    return {
      database,
      mqtt,
      pluginMqtt,
      wago,
      flow,
      rotation,
      execute: async (config) => {
        await commandNode.execute(
          { id: 'reliability', type: WAGO_COMMAND_NODE_TYPE, data: config },
          {},
          { compileTemplate: (template) => template },
        );
      },
      diagnostics: (controllerId) => diagnostics.read(controllerId),
      destroy: () => {
        flow.onModuleDestroy();
        wago.onModuleDestroy();
        void mqtt.onModuleDestroy();
      },
    };
  }

  async function seedDatabase(database: DataSource) {
    const now = new Date().toISOString();
    await database.getRepository(WagoSettings).save({ id: 1, defaultMqttServerId: 1, operationalPrefix: prefix });
    for (let index = 0; index < count; index += 1) {
      const controller = await database.getRepository(WagoController).save({
        hardwareId: hardwareId(index),
        trustState: 'claimed',
        name: `Reliability ${index}`,
        mqttServerId: 1,
        pairingCodeHash: 'reliability',
        protocolVersion: '1.0.0',
        runtimeVersion: '0.0.0',
        capabilities: '["claim","heartbeat","configuration-v1"]',
        lastSequence: 0,
        lastHeartbeatAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await database.getRepository(WagoConfigurationRevision).save({
        controllerId: controller.id,
        revision: 1,
        contentHash: hash(snapshot),
        snapshot: JSON.stringify(snapshot),
        state: 'applied',
        publishedAt: now,
      });
      await database.query('UPDATE plugin_wago_controllers SET credential_epoch = ? WHERE id = ?', [
        CREDENTIAL_EPOCH,
        controller.id,
      ]);
    }
  }

  async function openDatabase(file: string): Promise<DataSource> {
    const database = await new DataSource({
      type: 'sqlite',
      database: file,
      entities: plugin.entities,
      synchronize: true,
    }).initialize();
    const columns = await database.query('PRAGMA table_info(plugin_wago_controllers)');
    if (!columns.some((column: { name: string }) => column.name === 'credential_epoch'))
      await database.query('ALTER TABLE plugin_wago_controllers ADD COLUMN credential_epoch varchar');
    return database;
  }

  // --- farm ---------------------------------------------------------------------------------------
  async function startFarm(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      farm = fork(env('WAGO_RELIABILITY_FARM'), [], {
        env: {
          PATH: process.env.PATH,
          WAGO_RELIABILITY_MQTT_URL: env('WAGO_RELIABILITY_MQTT_URL'),
          WAGO_RELIABILITY_MQTT_PASSWORD: password,
          WAGO_RELIABILITY_PREFIX: prefix,
          WAGO_RELIABILITY_DIRECTORY: directory,
          WAGO_RELIABILITY_CONTROLLERS: String(count),
        },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      });
      farm.on('error', reject);
      farm.on('message', (message: Record<string, unknown>) => {
        if (message.ready) resolve();
        else if (typeof message.id === 'number') pendingRequests.get(message.id)?.(message);
      });
      farm.once('exit', (code) => reject(new Error(`controller farm exited early (${code})`)));
    });
    farm?.removeAllListeners('exit');
  }

  type Request = FarmRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

  function ask<T extends Record<string, unknown>>(request: Request): Promise<T> {
    const id = (nextRequest += 1);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`farm request ${request.op} timed out`)), 60_000);
      pendingRequests.set(id, (message) => {
        clearTimeout(timer);
        pendingRequests.delete(id);
        if (message.error) reject(new Error(String(message.error)));
        else resolve(message as T);
      });
      farm?.send({ ...request, id });
    });
  }

  const snapshots = async () => (await ask<{ controllers: ControllerSnapshot[] }>({ op: 'snapshot' })).controllers;
  /** Streams the farm's per-command records after flushing them; the file grows to millions of lines in the sweep. */
  async function forEachRecord(visit: (record: CommandRecord) => void): Promise<void> {
    await ask({ op: 'flush-records' });
    const file = join(directory, 'command-records.jsonl');
    const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    try {
      for await (const line of lines) if (line) visit(JSON.parse(line));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  async function acceptedCounts(): Promise<Map<string, number>> {
    const accepted = new Map<string, number>();
    await forEachRecord((record) => {
      if (record.kind === 'acknowledged' && record.status === 'accepted')
        accepted.set(record.commandId, (accepted.get(record.commandId) ?? 0) + 1);
    });
    return accepted;
  }

  // --- load ---------------------------------------------------------------------------------------
  async function send(index: number): Promise<void> {
    const current = host;
    if (paused || !current) return;
    const sentAt = Date.now();
    const duringFailure = failureActive;
    const channelId = CHANNELS[index % CHANNELS.length];
    const value = (toggles[index] = !toggles[index]);
    let outcome: CommandResult['outcome'] = 'acknowledged';
    inFlight += 1;
    try {
      await current.execute({
        controllerId: index + 1,
        channelId,
        action: 'set',
        value,
        expectedConfigurationRevision: 1,
        completionBehavior: 'acknowledged',
        acknowledgementTimeoutSeconds: 5,
      });
    } catch (error) {
      const kind = error instanceof WagoCommandError ? error.kind : 'transport-dispatch';
      outcome =
        kind === 'acknowledgement-timeout'
          ? 'timeout'
          : kind === 'controller-rejection'
            ? 'rejected'
            : 'dispatch-failed';
    } finally {
      inFlight -= 1;
    }
    results.push({
      controller: index,
      channelId,
      value,
      sentAt,
      settledAt: Date.now(),
      outcome,
      duringFailure: duringFailure || failureActive,
    });
  }

  function startDriver() {
    driver = Array.from({ length: count }, (_, index) => setInterval(() => void send(index), 1000 / rate));
  }
  const stopDriver = () => {
    driver.forEach(clearInterval);
    driver = [];
  };

  /** Recovered once every controller has acknowledged a command sent after the failure ended. */
  async function waitRecovered(since: number, limitMs = 240_000): Promise<number | null> {
    const deadline = Date.now() + limitMs;
    while (Date.now() < deadline) {
      const healthy = new Set(
        results.filter((r) => r.sentAt >= since && r.outcome === 'acknowledged').map((r) => r.controller),
      );
      if (healthy.size === count) return Math.max(0, Date.now() - since);
      await delay(250);
    }
    return null;
  }

  /** Why a controller output is wrong, or undefined when every output is right. */
  function stateMismatch(actual: ControllerSnapshot[], current: Host): string | undefined {
    const commanded = [...results, ...injectedCommands];
    for (const controller of actual) {
      const seen = current.diagnostics(controller.index + 1).outputs;
      for (const [channel, value] of Object.entries(controller.outputs)) {
        if (seen[channel]?.value !== value)
          return `controller ${controller.index} ${channel}: controller holds ${value}, host shows ${seen[channel]?.value}`;
        const acceptable = acceptableValues(
          commanded.filter((command) => command.controller === controller.index && command.channelId === channel),
        );
        if (acceptable && !acceptable.has(value))
          return `controller ${controller.index} ${channel}: controller holds ${value}, last acknowledged command set ${!value}`;
      }
    }
    return undefined;
  }

  /**
   * After the driver's commands settled, every controller output must equal both the host's picture of it and the
   * last acknowledged command (a later command with an unknown outcome makes either value acceptable). The second
   * comparison catches a runtime that resets its outputs on restart and publishes the reset state.
   */
  async function stateMatches(): Promise<{ matches: boolean; detail?: string }> {
    paused = true;
    try {
      // Commands settle within their 5 s acknowledgement timeout; the host's view then follows the next state message.
      for (const deadline = Date.now() + 15_000; inFlight > 0 && Date.now() < deadline;) await delay(100);
      const deadline = Date.now() + 30_000;
      for (;;) {
        const current = host;
        const detail = current ? stateMismatch(await snapshots(), current) : 'host is not running';
        if (!detail) return { matches: true };
        if (Date.now() >= deadline) return { matches: false, detail };
        await delay(500);
      }
    } finally {
      paused = false;
    }
  }

  // --- failures -----------------------------------------------------------------------------------
  const publishRaw = (target: string, payload: string | Buffer, retain = false) =>
    admin.publishAsync(target, payload, { qos: 1, retain });
  const commandMessage = (id: string, value: boolean) =>
    JSON.stringify({
      id,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      channelId: CHANNELS[0],
      action: 'set',
      value,
      expectedConfigurationRevision: 1,
    });

  /** An injector throws only when it could not inject its failure; `verify` is the failure-specific check. */
  const injectors: Record<Failure, () => Promise<{ detail?: string; verify?: () => Promise<boolean> }>> = {
    async 'broker-outage'() {
      await docker('stop', container);
      await delay(BROKER_OUTAGE_MS);
      await docker('start', container);
      // The broker's own start time is not product recovery, so recovery is measured from here. A broker that does
      // not come back within the runner's startup allowance is a harness error, not a verdict.
      for (const deadline = Date.now() + 300_000; ;) {
        try {
          await docker('exec', container, 'rabbitmq-diagnostics', '-q', 'check_running');
          break;
        } catch (error) {
          if (Date.now() > deadline) throw error;
          await delay(1_000);
        }
      }
      return { detail: `broker stopped for ${BROKER_OUTAGE_MS / 1000} s` };
    },
    async 'connection-loss'() {
      await ask({ op: 'drop-connections' });
      (Reflect.get(host!.mqtt, 'clients') as Map<number, MqttClient>).get(1)?.stream.destroy();
      return { detail: 'every controller socket and the host socket were destroyed' };
    },
    async 'runtime-restart'() {
      await ask({ op: 'restart-runtime', index: 1 });
      return { detail: 'controller 1 restarted from its saved state file' };
    },
    async 'server-restart'() {
      const old = host!;
      host = undefined;
      old.destroy();
      await delay(3_000);
      host = await startHost(old.database);
      return { detail: 'host services recreated on the saved database' };
    },
    async 'duplicate-command'() {
      const id = randomUUID();
      const sentAt = Date.now();
      const payload = commandMessage(id, true);
      await publishRaw(topic(1, 'commands'), payload);
      await publishRaw(topic(1, 'commands'), payload);
      await publishRaw(topic(1, 'commands'), payload);
      await delay(2_000);
      const accepted = async () => (await acceptedCounts()).get(id) ?? 0;
      // Part of controller 1's commanded state from now on, so the lost-state check expects it.
      injectedCommands.push({
        controller: 1,
        channelId: CHANNELS[0],
        value: true,
        sentAt,
        settledAt: Date.now(),
        outcome: (await accepted()) > 0 ? 'acknowledged' : 'timeout',
        duringFailure: true,
      });
      return {
        detail: 'one command id delivered three times',
        verify: async () => (await accepted()) === 1,
      };
    },
    async 'out-of-order'() {
      const controller = host!.diagnostics(3);
      const stale = {
        timestamp: new Date(Date.now() - 600_000).toISOString(),
        streamId: controller.activeStream ?? randomUUID(),
        sequence: 1,
        connected: true,
        revision: 1,
        contentHash: hash(snapshot),
        outputs: Object.fromEntries(
          CHANNELS.map((channel) => [channel, !(controller.outputs[channel]?.value ?? false)]),
        ),
        inputs: {},
        readiness: { configurationAccepted: true, hardwareAvailable: true, ready: true },
      };
      await publishRaw(topic(2, 'state'), JSON.stringify(stale));
      await delay(1_500);
      // The live controller keeps toggling, so compare the property that matters rather than a snapshot:
      // no output sample may carry the stale message's source time.
      const adopted = () =>
        Object.values(host!.diagnostics(3).outputs).some((sample) => sample.sourceAt === stale.timestamp);
      const adoptedAfterInjection = adopted();
      return {
        detail: 'a state message with an old timestamp and sequence 1 was injected',
        verify: async () => !adoptedAfterInjection && !adopted(),
      };
    },
    async 'oversized-messages'() {
      const before = (await snapshots())[3].dropCounts.oversized ?? 0;
      await publishRaw(topic(3, 'commands'), Buffer.alloc(70 * 1024, 0x20));
      await publishRaw(topic(3, 'configuration/desired'), Buffer.alloc(1024 * 1024 + 1024, 0x20));
      // Server-bound oversize: must be ignored without decoding.
      await publishRaw(topic(3, 'heartbeat'), Buffer.alloc(70 * 1024, 0x20));
      await publishRaw(topic(3, 'acknowledgements'), Buffer.alloc(70 * 1024, 0x20));
      await delay(3_000);
      return {
        detail: '70 KiB command, >1 MiB desired configuration, and 70 KiB heartbeat and acknowledgement',
        verify: async () => ((await snapshots())[3].dropCounts.oversized ?? 0) >= before + 2,
      };
    },
    async 'rejected-configuration'() {
      const oversized: Snapshot = {
        ...snapshot,
        physicalPoints: Array.from({ length: 257 }, (_, index) => ({
          id: `p${index}`,
          hardwareProfile: '751-9301' as const,
          channel: index,
        })),
      };
      reported.length = 0;
      await publishRaw(
        topic(1, 'configuration/desired'),
        JSON.stringify({ protocolVersion: 1, revision: 2, contentHash: hash(oversized), snapshot: oversized }),
      );
      await delay(3_000);
      return {
        detail: 'revision 2 had 257 physical points',
        verify: async () => {
          const refused = reported
            .find((r) => r.body.revision === 2)
            ?.body.errors.some((error) => error.code === 'configuration_limit_exceeded');
          const running = (await snapshots())[1].revision === 1;
          return Boolean(refused) && running;
        },
      };
    },
    async 'credential-rotation'() {
      const outcome = await host!.rotation.rotate(
        1,
        prefix,
        { userId: 1, authenticationMethod: 'session' } as never,
        {
          assertOwned: async () => undefined,
          signal: new AbortController().signal,
          deadline: Date.now() + 90_000,
        } as never,
      );
      return {
        detail: `rotation revision ${outcome.revision} ${outcome.state} under load`,
        verify: async () => outcome.state === 'completed',
      };
    },
  };

  async function inject(failure: Failure): Promise<FailureResult> {
    const injectedAt = Date.now();
    failureActive = true;
    let injected: Awaited<ReturnType<(typeof injectors)[Failure]>> = {};
    let harnessError: string | undefined;
    try {
      injected = await injectors[failure]();
    } catch (error) {
      harnessError = `harness could not inject ${failure}: ${String(error)}`;
    }
    const since = Date.now();
    const recoveryMs = await waitRecovered(since);
    failureActive = false;
    const state = await stateMatches();
    let injectionVerified: boolean | null = null;
    let detail = injected.detail;
    if (injected.verify)
      try {
        injectionVerified = await injected.verify();
      } catch (error) {
        injectionVerified = false;
        detail = `${detail}; check failed: ${String(error)}`;
      }
    return {
      failure,
      injectedAt,
      recoveryMs,
      stateMatches: state.matches,
      ...(state.detail ? { stateDetail: state.detail } : {}),
      injectionVerified,
      detail,
      ...(harnessError ? { harnessError } : {}),
    };
  }

  // --- lifecycle ----------------------------------------------------------------------------------
  async function bringUp(controllers: number, commandsPerSecond: number): Promise<DataSource> {
    count = controllers;
    rate = commandsPerSecond;
    prefix = `reliability/${randomUUID()}`;
    toggles.length = 0;
    injectedCommands.length = 0;
    const database = await openDatabase(join(directory, `host-${randomUUID()}.sqlite`));
    await seedDatabase(database);
    for (let index = 0; index < count; index += 1)
      await publishRaw(
        topic(index, 'configuration/desired'),
        JSON.stringify({ protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot }),
        true,
      );
    await startFarm();
    host = await startHost(database);
    await admin.subscribeAsync(`${prefix}/v1/controllers/+/configuration/reported`, { qos: 1 });
    return database;
  }

  async function bringDown(database: DataSource) {
    stopDriver();
    await delay(1_000);
    if (farm) await ask({ op: 'shutdown' }).catch(() => undefined);
    farm = undefined;
    host?.destroy();
    host = undefined;
    await database.destroy();
  }

  const summaryPath = process.env.WAGO_RELIABILITY_SUMMARY;
  const machine = () => ({
    platform: `${platform()} ${release()} ${arch()}`,
    cpus: `${cpus().length} x ${cpus()[0]?.model ?? 'unknown'}`,
    memoryGiB: Math.round(totalmem() / 2 ** 30),
    node: process.version,
  });

  beforeAll(async () => {
    // The host logs every MQTT message at debug level; at this volume that would dominate the run.
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    admin = await connectAsync(`mqtt://${brokerHost}:${brokerPort}`, {
      username: 'fixture',
      password,
      clientId: `admin-${randomUUID()}`,
      reconnectPeriod: 1000,
    });
    admin.on('message', (received, payload) => {
      if (received.endsWith('/configuration/reported'))
        try {
          reported.push({ topic: received, body: JSON.parse(payload.toString()) });
        } catch {
          /* only well-formed reports matter here */
        }
    });
  });

  afterAll(async () => {
    stopDriver();
    if (farm) await ask({ op: 'shutdown' }).catch(() => farm?.kill('SIGKILL'));
    host?.destroy();
    await admin?.endAsync(true);
  });

  async function runFailureSuite(): Promise<{ startedAt: number; totals: ReturnType<typeof totalsFromResults> }> {
    const database = await bringUp(SHORT_MODE.controllers, SHORT_MODE.commandsPerSecond);
    const startedAt = Date.now();
    startDriver();
    // Failures are injected into a healthy fleet only; a fleet that never got healthy is a broken harness, not a verdict.
    if ((await waitRecovered(startedAt, 120_000)) === null) {
      const healthy = new Set(results.filter((r) => r.outcome === 'acknowledged').map((r) => r.controller));
      const unhealthy = Array.from({ length: count }, (_, index) => index).filter((index) => !healthy.has(index));
      throw new Error(
        `Harness error: controllers never became healthy within 120 s (never acknowledged: ${unhealthy.map(hardwareId).join(', ')})`,
      );
    }
    await delay(SHORT_MODE.settleMs);
    for (const failure of SHORT_MODE.failures) {
      failures.push(await inject(failure));
      await delay(SHORT_MODE.settleMs);
    }
    stopDriver();
    await delay(7_000);
    const accepted = await acceptedCounts();
    const drops: Record<string, number> = {};
    for (const controller of await snapshots())
      for (const [reason, value] of Object.entries(controller.dropCounts)) drops[reason] = (drops[reason] ?? 0) + value;
    const totals = totalsFromResults(
      results,
      accepted,
      hostQueueOverflows,
      drops,
      failures.filter((failure) => !failure.stateMatches).length,
    );
    await bringDown(database);
    return { startedAt, totals };
  }

  async function runSweep(): Promise<StepResult[]> {
    const steps: StepResult[] = [];
    for (const target of SWEEP_STEPS) {
      results.length = 0;
      hostQueueOverflows = 0;
      const database = await bringUp(target.controllers, target.commandsPerSecond);
      const startedAt = Date.now();
      startDriver();
      await delay(SWEEP_STEP_MS);
      stopDriver();
      await delay(7_000);
      const accepted = await acceptedCounts();
      const drops: Record<string, number> = {};
      for (const controller of await snapshots())
        for (const [reason, value] of Object.entries(controller.dropCounts))
          drops[reason] = (drops[reason] ?? 0) + value;
      const latencies = results.filter((r) => r.outcome === 'acknowledged').map((r) => r.settledAt - r.sentAt);
      const step: StepResult = {
        controllers: target.controllers,
        commandsPerSecond: target.commandsPerSecond,
        durationMs: Date.now() - startedAt,
        totals: totalsFromResults(results, accepted, hostQueueOverflows, drops, 0),
        p95AcknowledgementMs: percentile(latencies, 0.95),
      };
      steps.push(step);
      process.stdout.write(
        `sweep ${target.controllers} controllers x ${target.commandsPerSecond}/s: ${stepPasses(step) ? 'pass' : 'FAIL'}\n`,
      );
      await bringDown(database);
      rmSync(join(directory, 'command-records.jsonl'), { force: true });
    }
    return steps;
  }

  it(`runs the ${mode} scenario and writes its JSON summary`, async () => {
    const startedAt = new Date();
    let steps: StepResult[] | undefined;
    if (mode === 'sweep') steps = await runSweep();
    results.length = 0;
    hostQueueOverflows = 0;
    failures.length = 0;
    const suite = await runFailureSuite();
    const reasons = shortModeFailures(suite.totals, failures);
    const invalid = harnessErrors(failures);
    const notes = shortModeNotes(suite.totals, failures);
    const summary = {
      label: 'simulator measurement',
      mode,
      commit: process.env.WAGO_RELIABILITY_COMMIT ?? 'unknown',
      broker: process.env.WAGO_RELIABILITY_BROKER ?? 'unknown',
      machine: machine(),
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      controllers: SHORT_MODE.controllers,
      commandsPerSecond: SHORT_MODE.commandsPerSecond,
      failures,
      totals: suite.totals,
      // `verdict` is the product gate: lost commands, lost state, host queue overflows, recovery over 180 s.
      // `harness` lists failures that could not be injected; any entry makes the run invalid regardless of verdict.
      // `notes` are non-gating checks (duplicates, injection checks, healthy rejections or dispatch failures).
      verdict: { pass: reasons.length === 0, reasons },
      harness: { valid: invalid.length === 0, errors: invalid },
      notes,
      ...(steps
        ? {
            steps,
            published: publishedLimits(
              steps,
              failures.map((failure) => failure.recoveryMs),
            ),
          }
        : {}),
    };
    const json = JSON.stringify(summary, null, 2);
    if (summaryPath) writeFileSync(summaryPath, json);
    process.stdout.write(`${json}\n`);
    expect({ harnessErrors: invalid }).toEqual({ harnessErrors: [] });
    if (mode === 'short') expect({ productFailures: reasons }).toEqual({ productFailures: [] });
    else expect(summary.published?.singleControllerDefect).toBe(false);
  });
});
