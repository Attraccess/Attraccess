import * as mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { RabbitmqCredentialProvisioningProvider } from './rabbitmq-credential-provisioning.provider';

jest.setTimeout(180_000);

const RABBITMQ_IMAGE = 'rabbitmq:4.3.4-management';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin-password';

describe('RabbitMQ credential provisioning isolation (e2e)', () => {
  let container: StartedTestContainer | null = null;
  let provider: RabbitmqCredentialProvisioningProvider;
  let mqttUrl: string;
  let adminUrl: string;
  let vhost: string;
  let controllerA: { identity: string; username: string; password: string };
  let controllerB: { identity: string; username: string; password: string };
  const clients: MqttClient[] = [];

  beforeAll(async () => {
    container = await new GenericContainer(RABBITMQ_IMAGE)
      .withEnvironment({ RABBITMQ_DEFAULT_USER: ADMIN_USERNAME, RABBITMQ_DEFAULT_PASS: ADMIN_PASSWORD })
      .withCommand(['bash', '-c', 'rabbitmq-plugins enable --offline rabbitmq_mqtt; rabbitmq-server'])
      .withExposedPorts(1883, 15672)
      .withWaitStrategy(Wait.forLogMessage('Server startup complete'))
      .start();

    const host = container.getHost();
    mqttUrl = `mqtt://${host}:${container.getMappedPort(1883)}`;
    adminUrl = `http://${host}:${container.getMappedPort(15672)}`;
    // RabbitMQ's MQTT TCP listener serves its configured vhost (the default is
    // /), rather than selecting a vhost from the MQTT connection.
    vhost = '/';
    controllerA = { identity: `controller-a-${Date.now()}`, username: `controller-a-${Date.now()}`, password: '' };
    controllerB = { identity: `controller-b-${Date.now()}`, username: `controller-b-${Date.now()}`, password: '' };

    const context = {
      getMqttServerConfig: jest.fn().mockResolvedValue({
        id: 1,
        name: 'RabbitMQ test broker',
        host,
        port: container.getMappedPort(1883),
        useTls: false,
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
        clientId: null,
      }),
    } as unknown as PluginContext;
    provider = new RabbitmqCredentialProvisioningProvider(context);
    jest
      .spyOn((provider as unknown as { client: { managementApiBase: () => string } }).client, 'managementApiBase')
      .mockReturnValue(adminUrl);

    const [credentialA, credentialB] = await Promise.all([
      provider.provision({
        mqttServerId: 1,
        identity: controllerA.identity,
        username: controllerA.username,
        vhost,
        topicPolicy: {
          publish: [`devices/${controllerA.identity}/reported/+/value`],
          subscribe: [`devices/${controllerA.identity}/desired/#`],
        },
      }),
      provider.provision({
        mqttServerId: 1,
        identity: controllerB.identity,
        username: controllerB.username,
        vhost,
        topicPolicy: {
          publish: [`devices/${controllerB.identity}/reported/#`],
          subscribe: [`devices/${controllerB.identity}/desired/#`],
        },
      }),
    ]);
    controllerA.password = credentialA.password;
    controllerB.password = credentialB.password;
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.end(true);
  });

  afterAll(async () => {
    if (!container) return;
    await Promise.allSettled([
      provider.revoke({ mqttServerId: 1, identity: controllerA.identity, username: controllerA.username, vhost }),
      provider.revoke({ mqttServerId: 1, identity: controllerB.identity, username: controllerB.username, vhost }),
    ]);
    await container.stop();
  });

  it('prevents one controller from writing or reading another controller namespace', async () => {
    const reportedA = `devices/${controllerA.identity}/reported/state/value`;
    const reportedB = `devices/${controllerB.identity}/reported/state`;
    const desiredA = `devices/${controllerA.identity}/desired/configuration`;
    const desiredB = `devices/${controllerB.identity}/desired/configuration`;

    const observer = await connect(mqttUrl, clients, ADMIN_USERNAME, ADMIN_PASSWORD, 'observer');
    const a = await connect(mqttUrl, clients, controllerA.username, controllerA.password, controllerA.identity);
    await subscribe(observer, [reportedA, reportedB]);

    const ownReported = nextMessage(observer, reportedA);
    await publish(a, reportedA, 'allowed');
    await expect(ownReported).resolves.toBe('allowed');

    await subscribe(a, [desiredA]);
    const ownDesired = nextMessage(a, desiredA);
    await publish(observer, desiredA, 'allowed');
    await expect(ownDesired).resolves.toBe('allowed');

    await subscribeIgnoringAuthorizationFailure(a, desiredB);
    const otherDesired = nextMessage(a, desiredB, 1_000);
    await publish(observer, desiredB, 'forbidden');
    await expect(otherDesired).resolves.toBeNull();

    const otherReported = nextMessage(observer, reportedB, 1_000);
    await publishIgnoringAuthorizationFailure(a, reportedB, 'forbidden');
    await expect(otherReported).resolves.toBeNull();
  });

  it('keeps + within one MQTT topic level', async () => {
    const allowed = `devices/${controllerA.identity}/reported/telemetry/value`;
    const nested = `devices/${controllerA.identity}/reported/telemetry/current/value`;
    const observer = await connect(mqttUrl, clients, ADMIN_USERNAME, ADMIN_PASSWORD, 'wildcard-observer');
    const a = await connect(
      mqttUrl,
      clients,
      controllerA.username,
      controllerA.password,
      `${controllerA.identity}-wildcard`,
    );
    await subscribe(observer, [allowed, nested]);

    const allowedMessage = nextMessage(observer, allowed);
    await publish(a, allowed, 'allowed');
    await expect(allowedMessage).resolves.toBe('allowed');

    const nestedMessage = nextMessage(observer, nested, 1_000);
    await publishIgnoringAuthorizationFailure(a, nested, 'forbidden');
    await expect(nestedMessage).resolves.toBeNull();
  });
});

async function connect(
  mqttUrl: string,
  clients: MqttClient[],
  username: string,
  password: string,
  clientId: string,
): Promise<MqttClient> {
  const client = mqtt.connect(mqttUrl, { username, password, clientId, clean: true, reconnectPeriod: 0 });
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', () => resolve());
    client.once('error', reject);
  });
  return client;
}

async function subscribe(client: MqttClient, topics: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    client.subscribe(topics, (error, grants) => {
      if (error || grants?.some((grant) => grant.qos === 128)) reject(error ?? new Error('Subscription was rejected.'));
      else resolve();
    });
  });
}

async function subscribeIgnoringAuthorizationFailure(client: MqttClient, topic: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, 1_000);
    function done(): void {
      clearTimeout(timer);
      client.off('error', done);
      client.off('close', done);
      resolve();
    }
    client.subscribe(topic, done);
    client.once('error', done);
    client.once('close', done);
  });
}

async function publish(client: MqttClient, topic: string, payload: string): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    client.publish(topic, payload, (error) => (error ? reject(error) : resolve())),
  );
}

async function publishIgnoringAuthorizationFailure(client: MqttClient, topic: string, payload: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, 1_000);
    function done(): void {
      clearTimeout(timer);
      client.off('error', done);
      client.off('close', done);
      resolve();
    }
    client.publish(topic, payload, done);
    client.once('error', done);
    client.once('close', done);
  });
}

function nextMessage(client: MqttClient, topic: string, timeout = 5_000): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => done(null), timeout);
    const onMessage = (receivedTopic: string, payload: Buffer) => {
      if (receivedTopic === topic) done(payload.toString());
    };
    const done = (payload: string | null) => {
      clearTimeout(timer);
      client.off('message', onMessage);
      resolve(payload);
    };
    client.on('message', onMessage);
  });
}
