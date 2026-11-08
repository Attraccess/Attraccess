import * as mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { PluginContext, PluginMqttMessage } from '@attraccess/plugins-backend-sdk';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { RabbitmqManagementClient } from '../management/client';
import { RabbitmqConnectionsService, toConnection } from '../connections/service';
import { list } from '../management/config';
import { RabbitmqStatsService } from '../stats/service';
import { encodeLiveIdentifier, RabbitmqMessagesService, type RabbitmqLiveEvent } from './service';

jest.setTimeout(180_000);

const RABBITMQ_IMAGE = 'rabbitmq:4.3.4-management';
const ADMIN = { username: 'admin', password: 'admin-password' };

// MQTT 3.1.1 §4.7 matching for the fake host connection below (mqtt.js has no
// public matcher).
function topicMatches(filter: string, topic: string): boolean {
  const filterLevels = filter.split('/');
  const topicLevels = topic.split('/');
  for (let index = 0; index < filterLevels.length; index += 1) {
    if (filterLevels[index] === '#') return true;
    if (index >= topicLevels.length) return false;
    if (filterLevels[index] !== '+' && filterLevels[index] !== topicLevels[index]) return false;
  }
  return filterLevels.length === topicLevels.length;
}

function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms waiting for ${what}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

describe('RabbitMQ connections, stats and message explorer (e2e)', () => {
  let container: StartedTestContainer;
  let url: string;
  let context: PluginContext;
  let messages: RabbitmqMessagesService;
  let topic: {
    source: (s: { identifier: string }, u: never) => import('rxjs').Observable<{ data: RabbitmqLiveEvent }>;
  };
  const clients: MqttClient[] = [];
  // Resolves once the broker acknowledged each subscription the plugin made.
  const acknowledgements: Promise<unknown>[] = [];
  // The host's shared MQTT connection; other host subscribers use it too.
  let shared: MqttClient;

  const connect = async (clientId: string): Promise<MqttClient> => {
    const client = mqtt.connect(url, { ...ADMIN, clientId, reconnectPeriod: 0 });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('error', reject);
    });
    return client;
  };

  beforeAll(async () => {
    container = await new GenericContainer(RABBITMQ_IMAGE)
      .withEnvironment({ RABBITMQ_DEFAULT_USER: ADMIN.username, RABBITMQ_DEFAULT_PASS: ADMIN.password })
      .withCommand(['bash', '-c', 'rabbitmq-plugins enable --offline rabbitmq_mqtt; rabbitmq-server'])
      .withExposedPorts(1883, 15672)
      .withWaitStrategy(Wait.forLogMessage('Server startup complete'))
      .start();
    const host = container.getHost();
    url = `mqtt://${host}:${container.getMappedPort(1883)}`;

    // The plugin's host-side MQTT access, backed by a real client.
    shared = await connect('attraccess-host');
    let handlers: { filter: string; handler: (m: PluginMqttMessage) => void }[] = [];
    shared.on('message', (messageTopic, payload) => {
      for (const { filter, handler } of handlers) {
        if (topicMatches(filter, messageTopic)) handler({ serverId: 1, topic: messageTopic, payload });
      }
    });
    const register = jest.fn();
    context = {
      getMqttServerConfig: jest.fn().mockResolvedValue({
        id: 1,
        name: 'e2e',
        host,
        port: container.getMappedPort(1883),
        managementPort: container.getMappedPort(15672),
        useTls: false,
        username: ADMIN.username,
        password: ADMIN.password,
        clientId: null,
      }),
      mqtt: {
        subscribe: (_id: number, filter: string, handler: (m: PluginMqttMessage) => void) => {
          const subscribed = (async () => {
            await shared.subscribeAsync(filter);
            const entry = { filter, handler };
            handlers.push(entry);
            return {
              unsubscribe: () => {
                handlers = handlers.filter((candidate) => candidate !== entry);
                shared.unsubscribeAsync(filter).catch(() => undefined);
              },
            };
          })();
          acknowledgements.push(subscribed);
          return subscribed;
        },
        publish: async (_id: number, messageTopic: string, payload: string | Buffer) => {
          await shared.publishAsync(messageTopic, payload);
        },
      },
      liveUpdates: { register },
      logger: { warn: jest.fn() },
    } as unknown as PluginContext;
    messages = new RabbitmqMessagesService(context);
    messages.onModuleInit();
    topic = register.mock.calls[0][0];
  });

  afterAll(async () => {
    for (const client of clients) client.end(true, undefined, () => undefined);
    await container?.stop();
  });

  it('lists the broker connections and closes one', async () => {
    await connect('e2e-victim');
    const service = new RabbitmqConnectionsService(context, new RabbitmqManagementClient());
    const named = async () => (await service.listConnections(1)).connections.find((c) => c.clientId === 'e2e-victim');
    // The management plugin emits per-connection stats (state, bytes) every few
    // seconds; wait for them so the projection check below covers those fields.
    let target = await named();
    for (let attempt = 0; target?.state == null && attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      target = await named();
    }
    expect(target).toMatchObject({ user: ADMIN.username, vhost: '/', state: 'running', ssl: false });
    expect(target?.protocol).toMatch(/MQTT/);
    expect(target?.peerHost).toEqual(expect.any(String));
    expect(target?.peerPort).toEqual(expect.any(Number));
    expect(target?.connectedAt).toEqual(expect.any(Number));
    expect(target?.recvBytes).toEqual(expect.any(Number));
    expect(target?.sendBytes).toEqual(expect.any(Number));
    expect(target?.recvRate).toEqual(expect.any(Number));

    // The `columns=` projection keeps every field the mapper reads: whatever the
    // full object yields, the projected list (fetched after it) yields too.
    const config = await context.getMqttServerConfig(1);
    if (!config) throw new Error('no config');
    const full = list(await new RabbitmqManagementClient().request<unknown>(config, 'GET', '/connections'))
      .map(toConnection)
      .find((c) => c?.name === target?.name);
    const projected = (await service.listConnections(1)).connections.find((c) => c.name === target?.name);
    expect(full).toBeTruthy();
    for (const [field, value] of Object.entries(full ?? {})) {
      if (value === null) continue;
      // Counters and rates move between the two calls; presence must match.
      const actual = projected?.[field as keyof typeof projected];
      if (typeof value === 'number') expect(actual).toEqual(expect.any(Number));
      else expect(actual).toEqual(value);
    }
    const targetName = target?.name ?? '';
    await service.closeConnection(1, targetName, 'e2e');
    let remaining = true;
    for (let attempt = 0; remaining && attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      remaining = (await service.listConnections(1)).connections.some((c) => c.name === targetName);
    }
    expect(remaining).toBe(false);
  });

  it('reports the broker overview, nodes and queues', async () => {
    const stats = await new RabbitmqStatsService(context, new RabbitmqManagementClient()).getStats(1);
    expect(stats.overview.rabbitmqVersion).toMatch(/^4\./);
    expect(stats.nodes.length).toBeGreaterThan(0);
    // The `columns=` projection on /nodes keeps every field the mapper reads.
    expect(stats.nodes[0]).toEqual({
      name: expect.any(String),
      running: true,
      memUsed: expect.any(Number),
      memLimit: expect.any(Number),
      memAlarm: false,
      diskFree: expect.any(Number),
      diskFreeLimit: expect.any(Number),
      diskFreeAlarm: false,
      fdUsed: expect.any(Number),
      fdTotal: expect.any(Number),
      socketsUsed: expect.any(Number),
      socketsTotal: expect.any(Number),
      uptime: expect.any(Number),
    });
    expect(Array.isArray(stats.queues)).toBe(true);
  });

  it('streams a published message to a live subscriber, and only matching topics', async () => {
    let sub: import('rxjs').Subscription | undefined;
    const received = new Promise<RabbitmqLiveEvent>((resolve) => {
      sub = topic
        .source({ identifier: encodeLiveIdentifier(1, 'e2e/+/in') }, {
          id: 1,
          effectivePermissions: new Set(),
        } as never)
        .subscribe(({ data }) => {
          if (data.eventType === 'messages') resolve(data);
        });
    });
    try {
      // Publish only once the broker acknowledged the subscription.
      await within(Promise.all(acknowledgements), 10_000, 'the subscription acknowledgement');
      // Another subscriber on the shared host connection receives this topic;
      // it does not match the viewer's filter and must not reach the viewer.
      await shared.subscribeAsync('e2e/other/#');
      await messages.publish({ id: 1 } as never, 1, { topic: 'e2e/other/out', payload: 'no', qos: 0 });
      await messages.publish({ id: 1 } as never, 1, { topic: 'e2e/hello/in', payload: 'hi', qos: 0 });
      const event = await within(received, 15_000, 'the published message');
      expect(event.messages.map((message) => message.topic)).toEqual(['e2e/hello/in']);
      expect(event.messages[0]).toMatchObject({ topic: 'e2e/hello/in', size: 2 });
    } finally {
      sub?.unsubscribe();
    }
  });
});
