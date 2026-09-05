/* eslint-disable @nx/enforce-module-boundaries -- This integration intentionally runs the independent simulator against the real backend protocol and services. */
import { createServer, type Server } from 'node:net';
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connect, type MqttClient } from 'mqtt';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoController } from '../../backend/wago-controller.entity';
import { WagoSettings } from '../../backend/wago-settings.entity';
import { WagoConfigurationRevision } from '../../backend/wago-configuration-revision.entity';
import { parseAnnouncement, parseHeartbeat, discoveryTopic } from '../../backend/protocol';
import { hash, type Snapshot } from '../src/runtime';

const temporary = process.env.WAGO_INTEGRATION_TEMP!;
const { WagoService } = require('../../backend/wago.service');
const createBroker = createRequire(join(temporary, 'package.json'))('aedes');
const hardwareId = 'integration-cc100';
const prefix = 'isolated/customer';
const base = `${prefix}/v1/controllers/${hardwareId}`;
const snapshot: Snapshot = {
  version: 1,
  physicalPoints: [
    { id: 'relay', hardwareProfile: '751-9301', channel: 0 },
    { id: 'sensor', hardwareProfile: '879-3000', channel: 0 },
  ],
  logicalChannels: [
    {
      id: 'load',
      physicalPointId: 'relay',
      profile: 'generic-digital-output',
      capabilities: ['output'],
      disconnectPolicy: { mode: 'hold' },
    },
    {
      id: 'level',
      physicalPointId: 'sensor',
      profile: 'generic-measurement',
      capabilities: ['measurement'],
      disconnectPolicy: { mode: 'hold' },
      measurement: { unit: 'percent', scale: 1, offset: 0 },
    },
  ],
};

async function eventually(assertion: () => void | Promise<void>, label: string, timeout = 6000): Promise<void> {
  const deadline = Date.now() + timeout;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${label}: ${String(last)}`);
}

// Only persistence and host SDK boundaries are substituted. All wire decoding,
// commissioning, report reconciliation and simulator execution are production code.
function repository(initial: Array<Record<string, any>> = []) {
  const rows = initial;
  const query = {
    where: () => query,
    andWhere: () => query,
    innerJoin: () => query,
    getMany: async () => rows,
  };
  return {
    rows,
    create: (value: object) => ({ id: rows.length + 1, ...value }),
    save: async (value: Record<string, any>) => {
      if (!rows.includes(value)) rows.push(value);
      return value;
    },
    find: async () => rows,
    findOneBy: async (where: object) =>
      rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
    createQueryBuilder: () => query,
  };
}

describe('isolated broker / executable simulator', () => {
  let broker: ReturnType<typeof createBroker>;
  let server: Server;
  let mqtt: MqttClient;
  let child: ChildProcess | undefined;
  let service: InstanceType<typeof WagoService>;
  let url: string;
  let errors: string[];
  let messages: Array<{ topic: string; payload: Buffer; username: string }>;
  let connections: string[];
  const identities = new Map<string, { password: string; publish: string[]; subscribe: string[] }>();
  const repositories = new Map<unknown, ReturnType<typeof repository>>();
  const matches = (pattern: string, topic: string) => {
    const parts = topic.split('/');
    const filter = pattern.split('/');
    return (
      filter.every((part, index) => part === '#' || part === '+' || part === parts[index]) &&
      (filter.at(-1) === '#' || filter.length === parts.length)
    );
  };
  let context: PluginContext;

  beforeEach(async () => {
    errors = [];
    messages = [];
    connections = [];
    repositories.clear();
    identities.clear();
    broker = createBroker();
    broker.authenticate = (client, username, password, done) => {
      const identity = identities.get(username);
      client.identity = username;
      done(null, username === 'integration-admin' || Boolean(identity && identity.password === password?.toString()));
    };
    broker.authorizePublish = (client, packet, done) => {
      const allowed =
        client.identity === 'integration-admin' ||
        identities.get(client.identity)?.publish.some((pattern) => matches(pattern, packet.topic));
      done(allowed ? null : new Error('publish denied'));
    };
    broker.authorizeSubscribe = (client, subscription, done) => {
      const allowed =
        client.identity === 'integration-admin' ||
        identities.get(client.identity)?.subscribe.includes(subscription.topic);
      done(allowed ? null : new Error('subscribe denied'), allowed ? subscription : null);
    };
    broker.on('clientReady', (client) => connections.push(client.identity));
    broker.on('publish', (packet, client) => {
      if (client) messages.push({ topic: packet.topic, payload: packet.payload, username: client.identity });
    });
    server = createServer(broker.handle);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('expected loopback TCP address');
    url = `mqtt://127.0.0.1:${address.port}`;
    mqtt = connect(url, { username: 'integration-admin', reconnectPeriod: 0 });
    await new Promise<void>((resolve, reject) => {
      mqtt.once('connect', () => resolve());
      mqtt.once('error', reject);
    });
    repositories.set(WagoSettings, repository([{ id: 1, defaultMqttServerId: 1, operationalPrefix: prefix }]));
    context = {
      getRepository: (entity: { name: string }) => {
        const existing = [...repositories.keys()].find((key: { name: string }) => key.name === entity.name);
        if (existing) return repositories.get(existing);
        if (!repositories.has(entity)) repositories.set(entity, repository());
        return repositories.get(entity);
      },
      getMqttServerConfig: async () => ({ host: '127.0.0.1', port: address.port, useTls: false }),
      getMqttCredentialProvisioning: () => ({
        provision: async (request) => {
          const password = `test-${request.username}`;
          identities.set(request.username, { password, ...request.topicPolicy });
          return { username: request.username, password };
        },
        revoke: async (request) => {
          identities.delete(request.username);
        },
      }),
      mqtt: {
        publish: async (_server, topic, payload, options) => {
          await mqtt.publishAsync(topic, payload, options);
        },
        subscribe: async (_server, topic, listener) => {
          const handler = (received: string, payload: Buffer, packet) => {
            if (matches(topic, received))
              Promise.resolve(listener({ topic: received, payload, retain: packet.retain })).catch((error) =>
                errors.push(String(error)),
              );
          };
          mqtt.on('message', handler);
          await mqtt.subscribeAsync(topic, { qos: 1 });
          return { unsubscribe: () => mqtt.off('message', handler) };
        },
      },
      logger: { warn: () => undefined },
    } as unknown as PluginContext;
    service = new WagoService(context);
    await service.onModuleInit();
  });

  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  afterEach(async () => {
    await stop();
    service?.onModuleDestroy();
    await mqtt?.endAsync(true);
    await new Promise<void>((resolve) => broker.close(resolve));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function launch(statePath: string, extra: Record<string, string> = {}) {
    child = spawn(process.execPath, ['--disable-warning=DEP0169', join(temporary, 'simulator.cjs')], {
      env: {
        PATH: process.env.PATH,
        WAGO_MQTT_URL: url,
        WAGO_STATE_PATH: statePath,
        WAGO_MQTT_PREFIX: 'must-not-change-discovery',
        WAGO_HEARTBEAT_INTERVAL_MS: '150',
        WAGO_MEASUREMENT_INTERVAL_MS: '100',
        WAGO_INITIAL_VALUES: '{"879-3000:0":42}',
        ...extra,
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr!.on('data', (data) => errors.push(data.toString()));
  }

  it('discovers, verifies physical code, claims, applies configuration, reconnects and restarts with permanent identity', async () => {
    const unauthorized = connect(url, { username: 'unknown-identity', reconnectPeriod: 0 });
    try {
      const rejected = await new Promise<Error>((resolve, reject) => {
        unauthorized.once('error', resolve);
        unauthorized.once('connect', () => reject(new Error('unknown identity connected')));
      });
      expect(rejected.message).toContain('Not authorized');
    } finally {
      await unauthorized.endAsync(true);
    }
    const enrollment = await service.createEnrollment(hardwareId, 1);
    const statePath = join(temporary, 'lifecycle-state.json');
    launch(statePath, {
      WAGO_HARDWARE_ID: hardwareId,
      WAGO_PAIRING_CODE: '482931',
      WAGO_ENROLLMENT_SECRET: enrollment.claimSecret,
      WAGO_ENROLLMENT_USERNAME: enrollment.username,
      WAGO_ENROLLMENT_PASSWORD: enrollment.password!,
    });
    const controllers = repositories.get(WagoController)!;
    await eventually(() => expect(controllers.rows).toHaveLength(1), 'discovery');
    const announcement = messages.find((item) => item.topic === discoveryTopic(hardwareId))!;
    expect(parseAnnouncement(announcement.payload).hardwareId).toBe(hardwareId);
    expect(announcement.username).toBe(enrollment.username);
    const discoveries = messages.filter((item) => item.topic === discoveryTopic(hardwareId)).length;
    Object.values(broker.clients).forEach((client: any) => {
      if (client.identity === enrollment.username) client.conn.destroy();
    });
    await eventually(
      () =>
        expect(messages.filter((item) => item.topic === discoveryTopic(hardwareId)).length).toBeGreaterThan(
          discoveries,
        ),
      'enrollment reconnect republishes fixed-root discovery',
    );
    const controller = controllers.rows[0];
    await expect(service.claim(controller.id, 'Isolated simulator', 'wrong-code')).rejects.toThrow('physical pairing');
    await service.claim(controller.id, 'Isolated simulator', '482931');
    await eventually(() => expect(controller.lastHeartbeatAt).toBeTruthy(), 'backend accepted permanent heartbeat');
    const heartbeat = messages.find((item) => item.topic === `${base}/heartbeat`)!;
    expect(parseHeartbeat(heartbeat.payload).hardwareId).toBe(hardwareId);
    expect(heartbeat.username).toBe(`wago-controller-${hardwareId}`);
    expect(JSON.parse(heartbeat.payload.toString())).not.toHaveProperty('pairingCode');
    const revision = {
      id: 1,
      controllerId: controller.id,
      revision: 1,
      state: 'published',
      contentHash: hash(snapshot),
      snapshot: JSON.stringify(snapshot),
    };
    repositories.get(WagoConfigurationRevision)!.rows.push(revision);
    await mqtt.publishAsync(
      `${base}/configuration/desired`,
      JSON.stringify({ protocolVersion: 1, revision: 1, contentHash: revision.contentHash, snapshot }),
      { qos: 1, retain: true },
    );
    await eventually(() => expect(revision.state).toBe('applied'), 'backend applied configuration');
    await mqtt.publishAsync(
      `${base}/commands`,
      JSON.stringify({ id: 'output-1', channelId: 'load', action: 'set', value: true }),
      { qos: 1 },
    );
    await eventually(
      () =>
        expect(
          messages.some(
            (item) =>
              item.topic === `${base}/acknowledgements` && JSON.parse(item.payload.toString()).status === 'accepted',
          ),
        ).toBe(true),
      'command acknowledgement',
    );
    await eventually(
      () =>
        expect(
          messages.some(
            (item) => item.topic === `${base}/state` && JSON.parse(item.payload.toString()).outputs.load === true,
          ),
        ).toBe(true),
      'physical output feedback',
    );
    const beforeReconnect = connections.filter((name) => name === `wago-controller-${hardwareId}`).length;
    const lastHeartbeat = controller.lastHeartbeatAt;
    Object.values(broker.clients).forEach((client: any) => {
      if (client.identity === `wago-controller-${hardwareId}`) client.conn.destroy();
    });
    await eventually(
      () =>
        expect(connections.filter((name) => name === `wago-controller-${hardwareId}`).length).toBeGreaterThan(
          beforeReconnect,
        ),
      'TCP reconnect',
    );
    await eventually(() => expect(controller.lastHeartbeatAt).not.toBe(lastHeartbeat), 'heartbeat after reconnect');
    await mqtt.publishAsync(
      `${base}/commands`,
      JSON.stringify({ id: 'after-reconnect', channelId: 'load', action: 'set', value: true }),
      { qos: 1 },
    );
    await eventually(
      () =>
        expect(
          messages.filter(
            (item) =>
              item.topic === `${base}/acknowledgements` && JSON.parse(item.payload.toString()).id === 'after-reconnect',
          ),
        ).toHaveLength(1),
      'command subscription restored without duplicate listeners',
    );
    await stop();
    const persisted = JSON.parse(await readFile(statePath, 'utf8'));
    expect(persisted).toMatchObject({
      simulatorHardwareId: hardwareId,
      accepted: { revision: 1 },
      outputs: { load: true },
    });
    const start = messages.length;
    launch(statePath); // no hardware ID, pairing code or enrollment credentials
    await eventually(
      () =>
        expect(
          messages
            .slice(start)
            .some((item) => item.topic === `${base}/heartbeat` && item.username === `wago-controller-${hardwareId}`),
        ).toBe(true),
      'permanent restart',
    );
    await eventually(
      () =>
        expect(
          messages
            .slice(start)
            .some(
              (item) => item.topic === `${base}/state` && JSON.parse(item.payload.toString()).outputs.load === true,
            ),
        ).toBe(true),
      'restored output',
    );
    expect(messages.slice(start).some((item) => item.topic === discoveryTopic(hardwareId))).toBe(false);
    expect(errors).toEqual([]);
  });

  it.each(['stale-heartbeat', 'offline', 'reject-configuration'])(
    'executes the %s scenario over MQTT',
    async (scenario) => {
      const statePath = join(temporary, `${scenario}.json`);
      const username = `wago-controller-${hardwareId}`;
      identities.set(username, {
        password: 'permanent',
        publish: [`${base}/#`],
        subscribe: [`${base}/commands`, `${base}/configuration/desired`],
      });
      await writeFile(
        statePath,
        JSON.stringify({
          simulatorHardwareId: hardwareId,
          credentials: { username, password: 'permanent' },
          operationalPrefix: prefix,
          outputs: {},
          commandIds: [],
        }),
      );
      launch(statePath, { WAGO_SCENARIO: scenario });
      await eventually(
        () => expect(messages.some((item) => item.topic === `${base}/heartbeat`)).toBe(true),
        'initial heartbeat',
      );
      if (scenario === 'reject-configuration') {
        await mqtt.publishAsync(
          `${base}/configuration/desired`,
          JSON.stringify({ protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot }),
          { qos: 1 },
        );
        await eventually(
          () =>
            expect(
              messages.some(
                (item) =>
                  item.topic === `${base}/configuration/reported` &&
                  JSON.parse(item.payload.toString()).errors[0]?.code === 'simulated_rejection',
              ),
            ).toBe(true),
          'rejected configuration',
        );
        expect(JSON.parse(await readFile(statePath, 'utf8')).accepted).toBeUndefined();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 600));
        expect(messages.filter((item) => item.topic === `${base}/heartbeat`)).toHaveLength(1);
        expect(messages.filter((item) => item.topic === `${base}/measurements`)).toHaveLength(0);
        const connected = Object.values(broker.clients).some((client: any) => client.identity === username);
        expect(connected).toBe(scenario === 'stale-heartbeat');
      }
      expect(errors).toEqual([]);
    },
  );

  const flowTest = process.env.WAGO_INTEGRATION_LIFECYCLE_ONLY === '1' ? it.skip : it;
  flowTest(
    'routes an unmodified runtime measurement through the actual parser and flow service to an output',
    async () => {
      const source = process.env.WAGO_INTEGRATION_FLOW_SOURCE!;
      // This intentionally fails when ATT-978 is absent or the producer contract
      // is incompatible. Never synthesize timestamp/sequence/measurement fields.
      const { WagoFlowService } = require(source);
      const { parseOperationalMessage } = require(join(dirnameOf(source), 'protocol.ts'));
      const statePath = join(temporary, 'flow.json');
      const username = `wago-controller-${hardwareId}`;
      identities.set(username, {
        password: 'permanent',
        publish: [`${base}/#`],
        subscribe: [`${base}/commands`, `${base}/configuration/desired`],
      });
      repositories.get(WagoController)!.rows.push({
        id: 1,
        hardwareId,
        trustState: 'claimed',
        mqttServerId: 1,
        lastHeartbeatAt: new Date().toISOString(),
        compatibilityError: null,
      });
      repositories.get(WagoConfigurationRevision)!.rows.push({
        id: 1,
        controllerId: 1,
        revision: 1,
        state: 'applied',
        snapshot: JSON.stringify(snapshot),
        contentHash: hash(snapshot),
      });
      await writeFile(
        statePath,
        JSON.stringify({
          simulatorHardwareId: hardwareId,
          credentials: { username, password: 'permanent' },
          operationalPrefix: prefix,
          accepted: { revision: 1, contentHash: hash(snapshot), snapshot },
          outputs: {},
          commandIds: [],
        }),
      );
      const triggers: unknown[] = [];
      Object.assign(context, {
        flows: {
          trigger: async (type: string, predicate: (config: object, nodeId: string) => boolean, payload: unknown) => {
            const config = { controllerId: 1, channelId: 'level', category: 'measurement' };
            if (!predicate(config, 'integration-measurement-node')) return;
            triggers.push({ type, payload });
            await mqtt.publishAsync(
              `${base}/commands`,
              JSON.stringify({ id: `flow-${triggers.length}`, channelId: 'load', action: 'set', value: true }),
              { qos: 1 },
            );
          },
        },
      });
      const flow = new WagoFlowService(context);
      try {
        await flow.onModuleInit();
        launch(statePath);
        await eventually(
          () => expect(messages.some((item) => item.topic === `${base}/measurements`)).toBe(true),
          'existing runtime measurement producer',
        );
        const measurement = messages.find((item) => item.topic === `${base}/measurements`)!;
        expect(parseOperationalMessage(prefix, measurement.topic, measurement.payload)).toMatchObject({
          hardwareId,
          message: { category: 'measurement', channelId: 'level', value: 42 },
        });
        await eventually(() => expect(triggers.length).toBeGreaterThan(0), 'actual WagoFlowService trigger');
        await eventually(
          () =>
            expect(
              messages.some(
                (item) =>
                  item.topic === `${base}/acknowledgements` &&
                  JSON.parse(item.payload.toString()).id.startsWith('flow-') &&
                  JSON.parse(item.payload.toString()).status === 'accepted',
              ),
            ).toBe(true),
          'flow command acknowledged',
        );
        await eventually(
          () =>
            expect(
              messages.some(
                (item) =>
                  item.topic === `${base}/state` &&
                  JSON.parse(item.payload.toString()).outputs.load === true &&
                  JSON.parse(item.payload.toString()).feedback.load === true,
              ),
            ).toBe(true),
          'flow changed physical output and feedback',
        );
        expect(errors).toEqual([]);
      } finally {
        flow.onModuleDestroy();
      }
    },
  );
});

function dirnameOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}
