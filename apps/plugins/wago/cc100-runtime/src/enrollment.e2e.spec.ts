import { rm } from 'node:fs/promises';
import * as mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { MemoryDeviceAdapter } from './adapters';
import { JsonStateStore, WagoRuntime, type Transport } from './runtime';

jest.setTimeout(180_000);

describe('CC100 MQTT enrollment (e2e)', () => {
  let container: StartedTestContainer;
  let url: string;
  let managementUrl: string;
  let observer: MqttClient;
  let discovery: MqttClient;
  let permanent: MqttClient;
  const statePath = `/tmp/wago-enrollment-${Date.now()}.json`;

  beforeAll(async () => {
    container = await new GenericContainer('rabbitmq:4.3.4-management')
      .withEnvironment({ RABBITMQ_DEFAULT_USER: 'runtime', RABBITMQ_DEFAULT_PASS: 'runtime-password' })
      .withCommand(['bash', '-c', 'rabbitmq-plugins enable --offline rabbitmq_mqtt; rabbitmq-server'])
      .withExposedPorts(1883, 15672)
      .withWaitStrategy(Wait.forLogMessage('Server startup complete'))
      .start();
    url = `mqtt://${container.getHost()}:${container.getMappedPort(1883)}`;
    managementUrl = `http://${container.getHost()}:${container.getMappedPort(15672)}`;
  });

  afterAll(async () => {
    for (const client of [observer, discovery, permanent]) client?.end(true);
    await rm(statePath, { force: true });
    await container.stop();
  });

  it('discovers, persists a claim, reconnects permanently, and emits an accepted heartbeat shape', async () => {
    observer = await connect(url, 'observer');
    discovery = await connect(url, 'discovery');
    const discoveryTransport = transport(discovery);
    const store = new JsonStateStore(statePath);
    const runtime = new WagoRuntime({
      hardwareId: 'cc100-e2e',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      enrollmentSecret: 'enrollment-secret',
      store,
      transport: discoveryTransport,
      device: new MemoryDeviceAdapter(),
    });
    const discoveryTopic = 'attraccess/wago/discovery/cc100-e2e';
    const claimTopic = `${discoveryTopic}/claim`;
    await subscribe(observer, [discoveryTopic]);
    const announcement = nextMessage(observer, discoveryTopic);
    await runtime.publishDiscoveryAnnouncement(1);
    expect(JSON.parse(await announcement)).toEqual(
      expect.objectContaining({
        hardwareId: 'cc100-e2e',
        pairingCode: '482931',
        enrollmentSecret: 'enrollment-secret',
        sequence: 1,
      }),
    );

    await provisionPermanentIdentity(managementUrl);
    let resolveClaim!: (credentials: { username: string; password: string; prefix?: string }) => void;
    const claim = new Promise<{ username: string; password: string; prefix?: string }>((resolve) => {
      resolveClaim = resolve;
    });
    await discoveryTransport.subscribe(claimTopic, async (payload) => {
      const credentials = await runtime.receiveDiscoveryClaim(payload);
      if (credentials) resolveClaim(credentials);
    });
    await publish(observer, claimTopic, {
      username: 'permanent-controller',
      password: 'permanent-password',
      configuration: { namespace: 'attraccess/wago' },
    });
    await expect(claim).resolves.toEqual({
      username: 'permanent-controller',
      password: 'permanent-password',
      prefix: 'attraccess/wago',
    });
    expect((await store.load()).credentials).toEqual({
      username: 'permanent-controller',
      password: 'permanent-password',
      prefix: 'attraccess/wago',
    });

    discovery.end(true);
    permanent = await connect(url, 'permanent-controller', 'permanent-controller', 'permanent-password');
    const permanentRuntime = new WagoRuntime({
      hardwareId: 'cc100-e2e',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: transport(permanent),
      device: new MemoryDeviceAdapter(),
    });
    const heartbeatTopic = 'attraccess/wago/v1/controllers/cc100-e2e/heartbeat';
    await subscribe(observer, [heartbeatTopic]);
    const heartbeat = nextMessage(observer, heartbeatTopic);
    await permanentRuntime.publishHeartbeat();
    expect(JSON.parse(await heartbeat)).toEqual(
      expect.objectContaining({
        hardwareId: 'cc100-e2e',
        pairingCode: '482931',
        protocolVersion: '1.0.0',
        runtimeVersion: '0.1.0',
        capabilities: expect.arrayContaining(['claim', 'heartbeat', 'configuration-v1']),
        sequence: expect.any(Number),
      }),
    );
  });
});

function transport(client: MqttClient): Transport {
  return {
    publish: (topic, payload, options) => publish(client, topic, payload, options?.retain),
    subscribe: (topic, listener) => subscribe(client, [topic], listener),
  };
}

async function connect(
  url: string,
  clientId: string,
  username = 'runtime',
  password = 'runtime-password',
): Promise<MqttClient> {
  const client = mqtt.connect(url, { username, password, clientId, reconnectPeriod: 0 });
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve);
    client.once('error', reject);
  });
  return client;
}

async function provisionPermanentIdentity(managementUrl: string): Promise<void> {
  const authorization = `Basic ${Buffer.from('runtime:runtime-password').toString('base64')}`;
  const request = async (path: string, body: unknown) => {
    const response = await fetch(`${managementUrl}${path}`, {
      method: 'PUT',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`RabbitMQ management API returned ${response.status}`);
  };
  await request('/api/users/permanent-controller', { password: 'permanent-password', tags: '' });
  await request('/api/permissions/%2F/permanent-controller', { configure: '', write: '.*', read: '.*' });
}

function subscribe(
  client: MqttClient,
  topics: string[],
  listener?: (payload: Buffer) => void | Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) =>
    client.subscribe(topics, (error) => {
      if (error) return reject(error);
      if (listener)
        client.on('message', (topic, payload) => {
          if (topics.includes(topic)) void listener(payload);
        });
      resolve();
    }),
  );
}

function publish(client: MqttClient, topic: string, payload: unknown, retain = false): Promise<void> {
  return new Promise((resolve, reject) =>
    client.publish(topic, JSON.stringify(payload), { qos: 1, retain }, (error) => (error ? reject(error) : resolve())),
  );
}

function nextMessage(client: MqttClient, expectedTopic: string): Promise<string> {
  return new Promise((resolve) => {
    const listener = (topic: string, payload: Buffer) => {
      if (topic !== expectedTopic) return;
      client.off('message', listener);
      resolve(payload.toString('utf8'));
    };
    client.on('message', listener);
  });
}
