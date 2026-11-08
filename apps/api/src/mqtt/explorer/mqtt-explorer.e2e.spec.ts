import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { MqttClient } from 'mqtt';
import type { Subscription } from 'rxjs';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { MqttClientService } from '../mqtt-client.service';
import { MqttMessageEvent } from '../mqtt-message.event';
import { MqttExplorerConnectionsService } from './mqtt-explorer-connections.service';
import { MqttExplorerService } from './mqtt-explorer.service';
import { CONNECTION_GRACE_MS, type MqttExplorerEvent } from './mqtt-explorer.constants';

jest.setTimeout(240_000);

const ADMIN = { username: 'admin', password: 'admin-password' };
const USER = { id: 1 } as never;
// A server entry with the wrong password.
const BAD_SERVER_ID = 2;

interface Broker {
  name: string;
  /** Whether the broker refuses wrong credentials (CONNACK error). */
  checksCredentials: boolean;
  start(): Promise<{ container: StartedTestContainer; port: number; username?: string; password?: string }>;
}

// The explorer is broker-agnostic: it must behave the same against both.
const BROKERS: Broker[] = [
  {
    name: 'Mosquitto',
    checksCredentials: false,
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
    checksCredentials: true,
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls `condition` until it holds, failing after `ms`. */
async function eventually(condition: () => boolean, what: string, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out after ${ms} ms waiting for ${what}`);
    await sleep(100);
  }
}

interface Watched {
  events: MqttExplorerEvent[];
  errors: unknown[];
}

const topicsOf = ({ events }: Watched) => events.flatMap((event) => event.messages.map((m) => m.topic));
const countOf = (watched: Watched, topic: string) => topicsOf(watched).filter((t) => t === topic).length;

describe.each(BROKERS)('MQTT message explorer against $name (e2e)', (broker) => {
  let container: StartedTestContainer;
  let shared: MqttClientService;
  let connections: MqttExplorerConnectionsService;
  let explorer: MqttExplorerService;
  const emit = jest.fn();
  const viewers: Subscription[] = [];

  const watch = async (filter: string, serverId = 1): Promise<Watched> => {
    const watched: Watched = { events: [], errors: [] };
    const stream = await explorer.subscribe(USER, serverId, filter);
    viewers.push(
      stream.subscribe({ next: ({ data }) => watched.events.push(data), error: (e) => watched.errors.push(e) }),
    );
    return watched;
  };
  const publish = (topic: string, payload = 'x') => explorer.publish(USER, 1, { topic, payload });
  /** The real readiness signal: republish until every viewer received the topic. */
  const republishUntilReceived = async (topic: string, ...watched: Watched[]) => {
    const deadline = Date.now() + 20_000;
    while (!watched.every((w) => topicsOf(w).includes(topic))) {
      if (Date.now() > deadline) throw new Error(`Timed out waiting for a message on ${topic}`);
      await publish(topic);
      await sleep(300);
    }
  };
  const explorerClients = () =>
    [...(connections as unknown as { connections: Map<string, { client?: MqttClient }> }).connections.values()]
      .map((connection) => connection.client)
      .filter((client): client is MqttClient => client !== undefined);

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
    const badServer = { ...server, id: BAD_SERVER_ID, username: 'nobody', password: 'wrong', clientId: 'bad' };
    const repository = {
      findOneBy: jest.fn(async ({ id }: { id: number }) => (id === BAD_SERVER_ID ? badServer : server)),
      update: jest.fn(),
    };
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
    // Each test starts without connections left in their grace period.
    connections.resetServer(1);
    connections.resetServer(BAD_SERVER_ID);
    emit.mockClear();
  });

  afterAll(async () => {
    connections?.onModuleDestroy();
    await shared?.onModuleDestroy();
    await container?.stop();
  });

  it('streams a published message to the explorer and only for matching topics', async () => {
    const watched = await watch('e2e/+/in');
    await republishUntilReceived('e2e/ready/in', watched);
    await publish('e2e/other/out', 'no');
    await publish('e2e/hello/in', 'hi');
    await eventually(() => topicsOf(watched).includes('e2e/hello/in'), 'e2e/hello/in');
    expect(topicsOf(watched).filter((topic) => topic !== 'e2e/ready/in')).toEqual(['e2e/hello/in']);
    const message = watched.events.flatMap((event) => event.messages).find((m) => m.topic === 'e2e/hello/in');
    expect(message).toMatchObject({ size: 2, truncated: false });
    expect(Buffer.from(message?.payload ?? '', 'base64').toString()).toBe('hi');
  });

  it('a # subscription never reaches the flow trigger path, and flows still trigger exactly once', async () => {
    const watched = await watch('#');
    // A flow's MQTT trigger subscribes through the shared client (acknowledged).
    await shared.subscribe(1, 'e2e/flow/trigger', 0, true);
    try {
      await republishUntilReceived('e2e/ready/flow', watched);
      await publish('e2e/noise/a', '1');
      await publish('e2e/noise/b', '2');
      await publish('e2e/flow/trigger', '3');
      const flowEvents = () => emit.mock.calls.filter(([name]) => name === MqttMessageEvent.EVENT_NAME);
      await eventually(() => topicsOf(watched).includes('e2e/flow/trigger'), 'the explorer to see the trigger');
      await eventually(() => flowEvents().length > 0, 'the flow trigger');
      // A barrier on the flow connection: a duplicate would arrive before this second trigger.
      await publish('e2e/flow/trigger', '4');
      await eventually(() => flowEvents().length > 1, 'the second flow trigger');

      // The explorer saw everything...
      expect(topicsOf(watched)).toEqual(expect.arrayContaining(['e2e/noise/a', 'e2e/noise/b', 'e2e/flow/trigger']));
      // ...but the flow connection only delivered what a flow subscribed to, once per message.
      expect(flowEvents().map(([, event]) => event.topic)).toEqual(['e2e/flow/trigger', 'e2e/flow/trigger']);
      expect(emit).toHaveBeenCalledTimes(2);
    } finally {
      await shared.unsubscribe(1, 'e2e/flow/trigger', 0);
    }
  });

  it('shares one broker connection between viewers of a filter and closes it after the last one left', async () => {
    const first = await watch('e2e/share/#');
    const second = await watch('e2e/share/#');
    await republishUntilReceived('e2e/share/ready', first, second);
    expect(connections.openConnectionCount).toBe(1);

    await publish('e2e/share/x');
    await eventually(() => countOf(first, 'e2e/share/x') > 0 && countOf(second, 'e2e/share/x') > 0, 'e2e/share/x');
    // One broker subscription per filter: each viewer got the message once.
    expect(countOf(first, 'e2e/share/x')).toBe(1);
    expect(countOf(second, 'e2e/share/x')).toBe(1);

    viewers.splice(0).forEach((viewer) => viewer.unsubscribe());
    expect(connections.openConnectionCount).toBe(1);
    await eventually(
      () => connections.openConnectionCount === 0,
      'the connection to close',
      CONNECTION_GRACE_MS + 5_000,
    );
  });

  it('gives each of two overlapping filters exactly one copy of a message', async () => {
    const everything = await watch('#');
    const branch = await watch('e2e/a/#');
    expect(connections.openConnectionCount).toBe(2);
    await republishUntilReceived('e2e/a/ready', everything, branch);

    await publish('e2e/a/x');
    // Per connection the broker keeps order: a duplicate would arrive before the barrier.
    await republishUntilReceived('e2e/a/barrier', everything, branch);
    expect(countOf(everything, 'e2e/a/x')).toBe(1);
    expect(countOf(branch, 'e2e/a/x')).toBe(1);
    expect(everything.errors).toEqual([]);
    expect(branch.errors).toEqual([]);
  });

  it('subscribes again after the connection dropped, because the session is clean', async () => {
    const watched = await watch('e2e/drop/#');
    await republishUntilReceived('e2e/drop/before', watched);
    const [client] = explorerClients();
    client.stream.destroy();
    await eventually(() => !client.connected, 'the connection to drop');
    await eventually(() => client.connected, 'the reconnect', 20_000);
    await republishUntilReceived('e2e/drop/after', watched);
    expect(watched.errors).toEqual([]);
  });

  it('errors the stream when the server settings change, and a new viewer connects again', async () => {
    const watched = await watch('e2e/reset/#');
    await republishUntilReceived('e2e/reset/before', watched);
    connections.resetServer(1);
    await eventually(() => watched.errors.length === 1, 'the stream to error');
    expect((watched.errors[0] as Error).message).toBe('The broker subscription failed.');
    expect(connections.openConnectionCount).toBe(0);

    const again = await watch('e2e/reset/#');
    await republishUntilReceived('e2e/reset/after', again);
  });

  if (broker.checksCredentials) {
    it('errors the stream at once when the broker refuses the connection', async () => {
      const started = Date.now();
      const watched = await watch('#', BAD_SERVER_ID);
      await eventually(() => watched.errors.length === 1, 'the stream to error');
      // A refused CONNACK is final; no waiting for the connect timeout.
      expect(Date.now() - started).toBeLessThan(8_000);
      expect((watched.errors[0] as Error).message).toBe('The broker subscription failed.');
      expect(connections.openConnectionCount).toBe(0);
      // The next attempt within the cool-down is refused without connecting.
      await expect(explorer.subscribe(USER, BAD_SERVER_ID, '#')).rejects.toMatchObject({ status: 503 });
    });
  }
});
