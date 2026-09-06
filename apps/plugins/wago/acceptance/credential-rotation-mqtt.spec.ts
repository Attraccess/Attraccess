import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { connectAsync, type MqttClient } from 'mqtt';
// Acceptance composes the standalone production runtime directly.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { MemoryDeviceAdapter } from '../cc100-runtime/src/adapters';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { JsonStateStore, WagoRuntime, type DiscoveryClaim, type Transport } from '../cc100-runtime/src/runtime';

jest.setTimeout(120_000);

describe('credential reconnect against an owned OrbStack RabbitMQ fixture', () => {
  const owner = randomUUID();
  const name = `wago-rotation-fixture-${owner}`;
  const administratorPassword = randomUUID();
  const identity = 'wago-controller-rotation-fixture';
  const exec = promisify(execFile);
  const docker = (...args: string[]) =>
    exec('docker', ['--context', process.env.WAGO_FLEET_DOCKER_CONTEXT ?? 'orbstack', ...args], { timeout: 60_000 });
  let container: string | undefined;
  let directory: string;
  let mqttUrl: string;
  let managementUrl: string;
  const clients: MqttClient[] = [];

  const request = async (path: string, body: unknown) => {
    const response = await fetch(`${managementUrl}/api${path}`, {
      method: 'PUT',
      headers: {
        authorization: `Basic ${Buffer.from(`fixture:${administratorPassword}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`Fixture management request failed: ${response.status}`);
  };

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'wago-rotation-mqtt-'));
    container = (
      await docker(
        'run',
        '-d',
        '--name',
        name,
        '--label',
        `attraccess.fixture.owner=${owner}`,
        '-p',
        '127.0.0.1::1883',
        '-p',
        '127.0.0.1::15672',
        '-e',
        'RABBITMQ_DEFAULT_USER=fixture',
        '-e',
        `RABBITMQ_DEFAULT_PASS=${administratorPassword}`,
        'rabbitmq:4-management',
        'sh',
        '-c',
        'rabbitmq-plugins enable --offline rabbitmq_mqtt >/dev/null && exec rabbitmq-server',
      )
    ).stdout.trim();
    const port = async (name: string) => {
      const value = (await docker('port', container as string, name)).stdout.trim();
      if (!/^127\.0\.0\.1:\d+$/.test(value)) throw new Error('Fixture port must be loopback-only');
      return value;
    };
    mqttUrl = `mqtt://${await port('1883/tcp')}`;
    managementUrl = `http://${await port('15672/tcp')}`;
    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        await request(`/users/${identity}`, { password: 'old-fixture', tags: '' });
        break;
      } catch (error) {
        if (Date.now() > deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    await request(`/permissions/%2F/${identity}`, { configure: '.*', write: '.*', read: '.*' });
  });

  afterAll(async () => {
    await Promise.all(clients.map((client) => new Promise<void>((resolve) => client.end(false, {}, () => resolve()))));
    try {
      let owned: { Id: string; Config: { Labels: Record<string, string> } } | undefined;
      try {
        owned = JSON.parse((await docker('inspect', '--type', 'container', name)).stdout)[0];
      } catch (error) {
        if (!/No such (object|container):/.test(String((error as { stderr?: string }).stderr))) throw error;
      }
      if (owned) {
        if (owned.Config.Labels['attraccess.fixture.owner'] !== owner || (container && owned.Id !== container))
          throw new Error('Fixture container ownership mismatch');
        await docker('rm', '-f', '-v', owned.Id);
      }
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  });

  it('acknowledges only after persisting and authenticating with the broker-rotated password', async () => {
    const administrator = await connectAsync(mqttUrl, {
      username: 'fixture',
      password: administratorPassword,
      clientId: `observer-${owner}`,
      reconnectPeriod: 0,
    });
    clients.push(administrator);
    const client = await connectAsync(mqttUrl, {
      username: identity,
      password: 'old-fixture',
      clientId: identity,
      reconnectPeriod: 0,
    });
    clients.push(client);
    const topic = 'attraccess/wago/v1/controllers/rotation-fixture/credentials/rotate';
    const token = 'a'.repeat(43);
    const store = new JsonStateStore(join(directory, 'state.json'));
    let authenticated: DiscoveryClaim = { username: identity, password: 'old-fixture', prefix: 'attraccess/wago' };
    await store.save({ credentials: authenticated, outputs: {}, commandIds: [] });
    const transport: Transport = {
      publish: async (topic, payload, options) => {
        await client.publishAsync(topic, JSON.stringify(payload), { qos: 1, retain: options?.retain });
      },
      subscribe: async (topic, listener) => {
        client.on('message', (received, payload) => {
          if (received === topic) void listener(payload);
        });
        await client.subscribeAsync(topic, { qos: 1 });
      },
    };
    let reconnects = 0;
    const runtime = new WagoRuntime({
      hardwareId: 'rotation-fixture',
      prefix: 'attraccess/wago',
      pairingCode: 'fixture',
      store,
      transport,
      device: new MemoryDeviceAdapter(),
      reconnectCredentials: async (credentials) => {
        expect((await store.load()).credentials).toEqual(credentials);
        await runtime.setConnected(false);
        authenticated = credentials;
        client.options.username = credentials.username;
        client.options.password = credentials.password;
        client.reconnect();
      },
    });
    client.on('connect', () => {
      reconnects++;
      void runtime.acknowledgeCredentialRotation(authenticated);
    });
    await runtime.start();
    const acknowledgement = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Fixture rotation acknowledgement timed out')), 15_000);
      administrator.on('message', (received, payload) => {
        if (received === `${topic}/ack`) {
          clearTimeout(timer);
          resolve(JSON.parse(payload.toString('utf8')));
        }
      });
    });
    await administrator.subscribeAsync(`${topic}/ack`, { qos: 1 });
    await request(`/users/${identity}`, { password: 'rotated-fixture', tags: '' });
    await administrator.publishAsync(
      topic,
      JSON.stringify({ username: identity, password: 'rotated-fixture', revision: 1, token }),
      { qos: 1, retain: false },
    );
    await expect(acknowledgement).resolves.toEqual({ revision: 1, token, status: 'reconnected' });
    expect(reconnects).toBe(1);
    expect((await store.load()).credentials?.password).toBe('rotated-fixture');
  });
});
