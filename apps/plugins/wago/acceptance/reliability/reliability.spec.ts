/**
 * Reliability harness. The real WagoService and WagoFlowService run on the host's real MqttClientService and
 * PluginMqttService against a runner-owned RabbitMQ 4 broker. Only the server record (QoS 0 defaults),
 * encryption, metrics and the timer are stubbed. Simulated controllers live in a separate process.
 *
 * SIMULATOR MEASUREMENT: nothing here is evidence about physical CC100 hardware.
 */
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type ChildProcess, execFile, fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
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
import plugin from '../../backend/plugin';
import { WagoCommandError } from '../../backend/commands/handler';
import { hash, type Snapshot } from '../../cc100-runtime/src/runtime';
import type { CommandRecord, ControllerSnapshot, FarmRequest } from './controller-farm';
import {
  BROKER_OUTAGE_MS,
  SHORT_MODE,
  SWEEP_STEPS,
  SWEEP_STEP_MS,
  percentile,
  publishedLimits,
  shortModeFailures,
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
const CREDENTIAL_EPOCH = '6b6b0b0e-3d0c-4d2a-9b7b-5f0f0b0b0b0b';

type Host = {
  database: DataSource;
  mqtt: MqttClientService;
  pluginMqtt: PluginMqttService;
  wago: WagoService;
  flow: WagoFlowService;
  rotation: WagoCredentialRotationService;
  execute: (config: Record<string, unknown>, id: string) => Promise<void>;
  diagnostics: (controllerId: number) => { outputs: Record<string, { value: boolean; sourceAt: string | null }>; activeStream?: string };
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
  let hostQueueDrops = 0;
  let failureActive = false;
  let paused = false;
  let driver: NodeJS.Timeout[] = [];
  const toggles: boolean[] = [];
  const reported: Array<{ topic: string; body: { revision: number; errors: Array<{ code: string }> } }> = [];

  const hardwareId = (index: number) => `rel-${index}`;
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
        if (/dropping new messages/.test(message)) hostQueueDrops += 1;
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
    const commands = Reflect.get(wago, 'commands') as {
      execute: (config: Record<string, unknown>, id: string) => Promise<void>;
    };
    const diagnostics = Reflect.get(wago, 'diagnostics') as { read: Host['diagnostics'] };
    return {
      database,
      mqtt,
      pluginMqtt,
      wago,
      flow,
      rotation,
      execute: (config, id) => commands.execute(config, id),
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
          WAGO_RELIABILITY_MQTT_URL: env('WAGO_RELIABILITY_MQTT_URL').replace('mqtt://', 'mqtt://'),
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
  const records = (): CommandRecord[] => {
    try {
      return readFileSync(join(directory, 'command-records.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  };

  // --- load ---------------------------------------------------------------------------------------
  async function send(index: number): Promise<void> {
    const current = host;
    if (paused || !current) return;
    const id = randomUUID();
    const sentAt = Date.now();
    const duringFailure = failureActive;
    toggles[index] = !toggles[index];
    let outcome: CommandResult['outcome'] = 'acknowledged';
    try {
      await current.execute(
        {
          controllerId: index + 1,
          channelId: CHANNELS[index % CHANNELS.length],
          action: 'set',
          value: toggles[index],
          expectedConfigurationRevision: 1,
          completionBehavior: 'acknowledged',
          acknowledgementTimeoutSeconds: 5,
        },
        id,
      );
    } catch (error) {
      const kind = error instanceof WagoCommandError ? error.kind : 'transport-dispatch';
      outcome =
        kind === 'acknowledgement-timeout'
          ? 'timeout'
          : kind === 'controller-rejection'
            ? 'rejected'
            : 'dispatch-failed';
    }
    results.push({
      controller: index,
      commandId: id,
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

  /** The host's picture of every controller output must match what the controller actually holds. */
  async function stateMatches(): Promise<boolean> {
    paused = true;
    try {
      await delay(2_500);
      const deadline = Date.now() + 30_000;
      for (;;) {
        const actual = await snapshots();
        const current = host;
        const mismatch =
          !current ||
          actual.some((controller) => {
            const seen = current.diagnostics(controller.index + 1).outputs;
            return Object.entries(controller.outputs).some(([channel, value]) => seen[channel]?.value !== value);
          });
        if (!mismatch) return true;
        if (Date.now() >= deadline) return false;
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

  const injectors: Record<Failure, () => Promise<{ detail?: string; verify?: () => Promise<boolean> }>> = {
    async 'broker-outage'() {
      await docker('stop', container);
      await delay(BROKER_OUTAGE_MS);
      await docker('start', container);
      for (const deadline = Date.now() + 120_000; ;) {
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
      const payload = commandMessage(id, true);
      await publishRaw(topic(1, 'commands'), payload);
      await publishRaw(topic(1, 'commands'), payload);
      await publishRaw(topic(1, 'commands'), payload);
      await delay(2_000);
      return {
        detail: 'one command id delivered three times',
        verify: async () => {
          const acks = records().filter((r) => r.kind === 'acknowledged' && r.commandId === id);
          return acks.filter((r) => r.kind === 'acknowledged' && r.status === 'accepted').length === 1;
        },
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
    let detail: string | undefined;
    let verify: (() => Promise<boolean>) | undefined;
    try {
      ({ detail, verify } = await injectors[failure]());
    } catch (error) {
      detail = `injection failed: ${String(error)}`;
      verify = async () => false;
    }
    const since = Date.now();
    const recoveryMs = await waitRecovered(since);
    failureActive = false;
    const matches = (await stateMatches()) && (verify ? await verify() : true);
    return { failure, injectedAt, recoveryMs, stateMatches: matches, detail };
  }

  // --- lifecycle ----------------------------------------------------------------------------------
  async function bringUp(controllers: number, commandsPerSecond: number): Promise<DataSource> {
    count = controllers;
    rate = commandsPerSecond;
    prefix = `reliability/${randomUUID()}`;
    toggles.length = 0;
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
    await waitRecovered(startedAt, 120_000);
    await delay(SHORT_MODE.settleMs);
    for (const failure of SHORT_MODE.failures) {
      failures.push(await inject(failure));
      await delay(SHORT_MODE.settleMs);
    }
    stopDriver();
    await delay(7_000);
    const accepted = new Map<string, number>();
    for (const record of records())
      if (record.kind === 'acknowledged' && record.status === 'accepted')
        accepted.set(record.commandId, (accepted.get(record.commandId) ?? 0) + 1);
    const drops: Record<string, number> = {};
    for (const controller of await snapshots())
      for (const [reason, value] of Object.entries(controller.dropCounts)) drops[reason] = (drops[reason] ?? 0) + value;
    const totals = totalsFromResults(
      results,
      accepted,
      hostQueueDrops,
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
      hostQueueDrops = 0;
      const database = await bringUp(target.controllers, target.commandsPerSecond);
      const startedAt = Date.now();
      startDriver();
      await delay(SWEEP_STEP_MS);
      stopDriver();
      await delay(7_000);
      const accepted = new Map<string, number>();
      for (const record of records())
        if (record.kind === 'acknowledged' && record.status === 'accepted')
          accepted.set(record.commandId, (accepted.get(record.commandId) ?? 0) + 1);
      const drops: Record<string, number> = {};
      for (const controller of await snapshots())
        for (const [reason, value] of Object.entries(controller.dropCounts))
          drops[reason] = (drops[reason] ?? 0) + value;
      const latencies = results.filter((r) => r.outcome === 'acknowledged').map((r) => r.settledAt - r.sentAt);
      const step: StepResult = {
        controllers: target.controllers,
        commandsPerSecond: target.commandsPerSecond,
        durationMs: Date.now() - startedAt,
        totals: totalsFromResults(results, accepted, hostQueueDrops, drops, 0),
        p95AcknowledgementMs: percentile(latencies, 0.95),
        recoveryMs: null,
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
    hostQueueDrops = 0;
    failures.length = 0;
    const suite = await runFailureSuite();
    const reasons = shortModeFailures(suite.totals, failures);
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
      verdict: { pass: reasons.length === 0, reasons },
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
    if (mode === 'short') expect(reasons).toEqual([]);
    else expect(summary.published?.singleControllerDefect).toBe(false);
  });
});
