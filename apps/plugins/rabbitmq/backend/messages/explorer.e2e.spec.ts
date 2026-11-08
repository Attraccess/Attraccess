import * as mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { PluginContext, PluginMqttMessage } from '@attraccess/plugins-backend-sdk';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { RabbitmqManagementClient } from '../management/client';
import { RabbitmqConnectionsService } from '../connections/service';
import { RabbitmqStatsService } from '../stats/service';
import { encodeLiveIdentifier, RabbitmqMessagesService, type RabbitmqLiveEvent } from './service';

jest.setTimeout(180_000);

const RABBITMQ_IMAGE = 'rabbitmq:4.3.4-management';
const ADMIN = { username: 'admin', password: 'admin-password' };

describe('RabbitMQ connections, stats and message explorer (e2e)', () => {
  let container: StartedTestContainer;
  let url: string;
  let context: PluginContext;
  let messages: RabbitmqMessagesService;
  let topic: {
    source: (s: { identifier: string }, u: never) => import('rxjs').Observable<{ data: RabbitmqLiveEvent }>;
  };
  const clients: MqttClient[] = [];

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
    const shared = await connect('attraccess-host');
    let handlers: { filter: string; handler: (m: PluginMqttMessage) => void }[] = [];
    shared.on('message', (messageTopic, payload) => {
      for (const { filter, handler } of handlers) {
        if (mqtt.topicMatches?.(filter, messageTopic) ?? true) handler({ serverId: 1, topic: messageTopic, payload });
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
        subscribe: async (_id: number, filter: string, handler: (m: PluginMqttMessage) => void) => {
          await shared.subscribeAsync(filter);
          const entry = { filter, handler };
          handlers.push(entry);
          return {
            unsubscribe: () => {
              handlers = handlers.filter((candidate) => candidate !== entry);
              shared.unsubscribeAsync(filter).catch(() => undefined);
            },
          };
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
    // The management plugin refreshes its connection stats every few seconds.
    const named = async () => (await service.listConnections(1)).connections.find((c) => c.clientId === 'e2e-victim');
    let target = await named();
    for (let attempt = 0; !target && attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      target = await named();
    }
    expect(target).toMatchObject({ user: ADMIN.username });
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
    expect(Array.isArray(stats.queues)).toBe(true);
  });

  it('streams a published message to a live subscriber', async () => {
    const received = new Promise<RabbitmqLiveEvent>((resolve) => {
      const sub = topic
        .source({ identifier: encodeLiveIdentifier(1, 'e2e/#') }, { id: 1, effectivePermissions: new Set() } as never)
        .subscribe(({ data }) => {
          if (data.eventType === 'messages') {
            sub.unsubscribe();
            resolve(data);
          }
        });
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await messages.publish({ id: 1 } as never, 1, {
      topic: 'e2e/hello',
      payload: 'hi',
      qos: 0,
    });
    const event = await received;
    expect(event.eventType === 'messages' && event.messages[0]).toMatchObject({ topic: 'e2e/hello', size: 2 });
  });
});
