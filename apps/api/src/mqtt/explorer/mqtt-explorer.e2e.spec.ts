import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Subscription } from 'rxjs';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { MqttClientService } from '../mqtt-client.service';
import { MqttMessageEvent } from '../mqtt-message.event';
import { MqttExplorerConnectionsService } from './mqtt-explorer-connections.service';
import { MqttExplorerService } from './mqtt-explorer.service';
import { CONNECTION_GRACE_MS, type MqttExplorerEvent } from './mqtt-explorer.constants';

jest.setTimeout(240_000);

const ADMIN = { username: 'admin', password: 'admin-password' };

interface Broker {
  name: string;
  start(): Promise<{ container: StartedTestContainer; port: number; username?: string; password?: string }>;
}

// The explorer is broker-agnostic: it must behave the same against both.
const BROKERS: Broker[] = [
  {
    name: 'Mosquitto',
    start: async () => {
      const container = await new GenericContainer('eclipse-mosquitto:2')
        .withCopyContentToContainer([
          { content: 'listener 1883\nallow_anonymous true\n', target: '/mosquitto/config/mosquitto.conf' },
        ])
        .withExposedPorts(1883)
        .withWaitStrategy(Wait.forLogMessage(/mosquitto version .* running/))
        .start();
      return { container, port: container.getMappedPort(1883) };
    },
  },
  {
    name: 'RabbitMQ',
    start: async () => {
      const container = await new GenericContainer('rabbitmq:4.3.4-management')
        .withEnvironment({ RABBITMQ_DEFAULT_USER: ADMIN.username, RABBITMQ_DEFAULT_PASS: ADMIN.password })
        .withCommand(['bash', '-c', 'rabbitmq-plugins enable --offline rabbitmq_mqtt; rabbitmq-server'])
        .withExposedPorts(1883)
        .withWaitStrategy(Wait.forLogMessage('Server startup complete'))
        .start();
      return { container, port: container.getMappedPort(1883), ...ADMIN };
    },
  },
];

function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms waiting for ${what}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.each(BROKERS)('MQTT message explorer against $name (e2e)', (broker) => {
  let container: StartedTestContainer;
  let shared: MqttClientService;
  let connections: MqttExplorerConnectionsService;
  let explorer: MqttExplorerService;
  const emit = jest.fn();
  const viewers: Subscription[] = [];

  const watch = async (filter: string) => {
    const events: MqttExplorerEvent[] = [];
    const stream = await explorer.subscribe({ id: 1 } as never, 1, filter);
    viewers.push(stream.subscribe(({ data }) => events.push(data)));
    return events;
  };
  const topicsOf = (events: MqttExplorerEvent[]) => events.flatMap((event) => event.messages.map((m) => m.topic));
  const waitForTopic = async (events: MqttExplorerEvent[], topic: string) => {
    const started = Date.now();
    while (!topicsOf(events).includes(topic)) {
      if (Date.now() - started > 15_000) throw new Error(`Timed out waiting for a message on ${topic}`);
      await sleep(100);
    }
  };

  beforeAll(async () => {
    const started = await broker.start();
    container = started.container;
    const server = {
      id: 1,
      name: broker.name,
      host: container.getHost(),
      port: started.port,
      useTls: false,
      username: started.username,
      password: started.password,
      clientId: 'attraccess-flows',
      defaultSubscribeQos: 0,
    };
    const repository = { findOneBy: jest.fn().mockResolvedValue(server), update: jest.fn() };
    shared = new MqttClientService(
      repository as never,
      { emit } as unknown as EventEmitter2,
      { isEncrypted: () => true, decrypt: (value: string) => value } as never,
      { mqttServersHealthy: { set: jest.fn() } } as never,
      { time: (_target: string, _operation: string, fn: () => Promise<unknown>) => fn() } as never,
    );
    connections = new MqttExplorerConnectionsService(repository as never, shared);
    explorer = new MqttExplorerService(repository as never, connections, shared, {
      recordAdministration: jest.fn(),
    } as never);
  });

  afterEach(() => {
    viewers.splice(0).forEach((viewer) => viewer.unsubscribe());
    emit.mockClear();
  });

  afterAll(async () => {
    connections?.onModuleDestroy();
    await shared?.onModuleDestroy();
    await container?.stop();
  });

  it('streams a published message to the explorer and only for matching topics', async () => {
    const events = await watch('e2e/+/in');
    await within(sleep(500), 5_000, 'the subscription');
    await explorer.publish({ id: 1 } as never, 1, { topic: 'e2e/other/out', payload: 'no' });
    await explorer.publish({ id: 1 } as never, 1, { topic: 'e2e/hello/in', payload: 'hi' });
    await waitForTopic(events, 'e2e/hello/in');
    expect(topicsOf(events)).toEqual(['e2e/hello/in']);
    expect(events[0].messages[0]).toMatchObject({ size: 2, truncated: false });
    expect(Buffer.from(events[0].messages[0].payload, 'base64').toString()).toBe('hi');
  });

  it('a # subscription never reaches the flow trigger path, and flows still trigger exactly once', async () => {
    const events = await watch('#');
    // A flow's MQTT trigger subscribes through the shared client.
    await shared.subscribe(1, 'e2e/flow/trigger', 0, true);
    try {
      await sleep(500);
      await explorer.publish({ id: 1 } as never, 1, { topic: 'e2e/noise/a', payload: '1' });
      await explorer.publish({ id: 1 } as never, 1, { topic: 'e2e/noise/b', payload: '2' });
      await explorer.publish({ id: 1 } as never, 1, { topic: 'e2e/flow/trigger', payload: '3' });
      await waitForTopic(events, 'e2e/flow/trigger');
      await sleep(1_000);

      // The explorer saw everything...
      expect(topicsOf(events)).toEqual(expect.arrayContaining(['e2e/noise/a', 'e2e/noise/b', 'e2e/flow/trigger']));
      // ...but the flow connection only delivered what a flow subscribed to, once.
      const flowEvents = emit.mock.calls.filter(([name]) => name === MqttMessageEvent.EVENT_NAME);
      expect(flowEvents).toHaveLength(1);
      expect(flowEvents[0][1]).toMatchObject({ topic: 'e2e/flow/trigger' });
      expect(emit).toHaveBeenCalledTimes(1);
    } finally {
      await shared.unsubscribe(1, 'e2e/flow/trigger', 0);
    }
  });

  it('shares one broker connection between viewers and closes it after the last one left', async () => {
    const first = await watch('e2e/share/#');
    const second = await watch('e2e/share/#');
    await sleep(500);
    expect(connections.openConnectionCount).toBe(1);

    await explorer.publish({ id: 1 } as never, 1, { topic: 'e2e/share/x', payload: 'x' });
    await waitForTopic(first, 'e2e/share/x');
    await waitForTopic(second, 'e2e/share/x');
    // One broker subscription per filter: each viewer got the message once.
    expect(topicsOf(first).filter((topic) => topic === 'e2e/share/x')).toHaveLength(1);

    viewers.splice(0).forEach((viewer) => viewer.unsubscribe());
    expect(connections.openConnectionCount).toBe(1);
    await sleep(CONNECTION_GRACE_MS + 2_000);
    expect(connections.openConnectionCount).toBe(0);
  });
});
