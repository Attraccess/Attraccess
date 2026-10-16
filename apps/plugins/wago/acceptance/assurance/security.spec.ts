/* eslint-disable @nx/enforce-module-boundaries -- Verify the production broker provider across the standalone integration boundary. */
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectAsync, type MqttClient } from 'mqtt';
import { RabbitmqManagementClient } from '../../../rabbitmq/backend/management/client';
import { MESSAGE_LIMITS } from '../../shared/protocol-limits';
import { AssuranceFixture, delay, eventually } from './fixture';

const output = process.env.WAGO_ASSURANCE_OUTPUT ?? '';
jest.setTimeout(120_000);
const deny = async (operation: Promise<unknown>) => {
  // RabbitMQ may close the socket without a PUBACK on authorization failure.
  await Promise.race([operation.catch(() => undefined), delay(500)]);
};
const request = (identity: string, root: string) => ({
  mqttServerId: 1,
  identity,
  username: identity,
  vhost: '/',
  topicPolicy: { publish: [`${root}/heartbeat`], subscribe: [`${root}/claim`] },
});

describe('independent broker identities and verified TLS', () => {
  const fixture = new AssuranceFixture();
  const evidence: string[] = [];
  beforeAll(async () => fixture.start(2));
  afterAll(async () => {
    await fixture.close();
    if (output)
      await writeFile(
        join(output, 'security.json'),
        JSON.stringify({ evidenceClass: 'real-loopback-broker-software-fixtures', assertions: evidence }, null, 2),
      );
  });

  it('permits authenticated traffic and denies cross-controller writes, reads and command injection', async () => {
    const [a, b] = fixture.devices;
    await fixture.command(a);
    await fixture.command(b);
    const own = `${fixture.prefix}/v1/controllers/${a.hardwareId}`;
    const other = `${fixture.prefix}/v1/controllers/${b.hardwareId}`;
    const deniedTopics = [`${other}/heartbeat`, `${own}/commands`, `${own}/configuration/desired`];
    await fixture.backendClient.subscribeAsync(deniedTopics, { qos: 1 });
    const observed: string[] = [];
    const receive = (topic: string) => {
      if (deniedTopics.includes(topic)) observed.push(topic);
    };
    fixture.backendClient.on('message', receive);
    try {
      for (const topic of deniedTopics) {
        const attacker = await fixture.connect(a.username, a.password);
        await deny(attacker.publishAsync(topic, 'unauthorized', { qos: 1 }));
        await attacker.endAsync(true);
      }
      await delay(250);
      expect(observed).toEqual([]);
      const reader = await fixture.connect(a.username, a.password);
      const leaked: string[] = [];
      reader.on('message', (topic) => leaked.push(topic));
      await deny(reader.subscribeAsync(`${other}/configuration/desired`, { qos: 1 }));
      await fixture.backendClient.publishAsync(`${other}/configuration/desired`, 'private', { qos: 1, retain: true });
      await delay(250);
      expect(leaked).toEqual([]);
      await reader.endAsync(true);
      // Retained data must not grant read access to a newly connected unauthorized identity either.
      const later = await fixture.connect(a.username, a.password);
      later.on('message', (topic) => leaked.push(topic));
      await deny(later.subscribeAsync(`${other}/configuration/desired`, { qos: 1 }));
      await delay(250);
      expect(leaked).toEqual([]);
      await fixture.backendClient.publishAsync(`${other}/configuration/desired`, '', { retain: true, qos: 1 });
      await later.endAsync(true);
      evidence.push(
        'per-controller publish/subscribe isolation; command/configuration injection denied; retained read denied',
      );
    } finally {
      fixture.backendClient.off('message', receive);
    }
  });

  it('counts transport rejections once per packet and retains them across runtime transport replacement', async () => {
    const device = fixture.devices[0];
    const topic = `${fixture.prefix}/v1/controllers/${device.hardwareId}/commands`;
    const listener = jest.fn();
    await device.transport.subscribe(topic, listener);
    const oversized = Buffer.alloc(MESSAGE_LIMITS.configurationBytes + 1, 65);
    await fixture.backendClient.publishAsync(topic, oversized, { qos: 1 });
    await eventually(() => device.transport.statistics.oversizedRejected === 1);
    expect(listener).not.toHaveBeenCalled();
    await device.client.endAsync(true);
    await fixture.startDevice(device);
    expect(fixture.retiredTransportRejected).toBe(1);
    expect(device.transport.statistics.oversizedRejected).toBe(0);
    await fixture.backendClient.publishAsync(topic, oversized, { qos: 1 });
    await eventually(() => device.transport.statistics.oversizedRejected === 1);
    expect(fixture.retiredTransportRejected + device.transport.statistics.oversizedRejected).toBe(2);
    await fixture.command(device);
    evidence.push(
      'oversized runtime MQTT packets counted once before listener delivery; cumulative count survives transport replacement; valid command resumes',
    );
  });

  it('separates enrollment from operational identities and rejects anonymous sessions', async () => {
    const identity = `enrollment-${randomUUID()}`;
    const root = `${fixture.prefix}/discovery/temporary`;
    const credential = await fixture.provider.provision(request(identity, root));
    const client = await fixture.connect(identity, credential.password);
    await client.subscribeAsync(`${root}/claim`, { qos: 1 });
    await client.publishAsync(`${root}/heartbeat`, 'allowed', { qos: 1 });
    await expect(
      client.subscribeAsync(`${fixture.prefix}/v1/controllers/controller-0/commands`, { qos: 1 }),
    ).rejects.toThrow();
    await expect(connectAsync(fixture.url, { reconnectPeriod: 0, connectTimeout: 2000 })).rejects.toThrow();
    await client.endAsync(true);
    await fixture.provider.revoke({ mqttServerId: 1, identity, username: identity, vhost: '/' });
    evidence.push('enrollment namespace cannot subscribe to operational commands; anonymous CONNECT denied');
  });

  it('revokes an active controller connection and refuses new sessions with its old secret', async () => {
    const device = fixture.devices[1];
    device.client.options.reconnectPeriod = 0;
    await fixture.provider.revoke({
      mqttServerId: 1,
      identity: device.username,
      username: device.username,
      vhost: '/',
    });
    await eventually(() => !device.client.connected);
    await expect(fixture.connect(device.username, device.password)).rejects.toThrow();
    evidence.push('revocation closes active MQTT session and denies new sessions');
  });

  it('verifies MQTT and management certificates with a private CA, rejects missing trust and wrong names', async () => {
    const ca = await readFile(process.env.WAGO_FLEET_CA ?? '', 'utf8');
    const mqtts = process.env.WAGO_FLEET_MQTTS_URL ?? '';
    const https = process.env.WAGO_FLEET_HTTPS_URL ?? '';
    if (!/^mqtts:\/\/127\.0\.0\.1:\d+$/.test(mqtts) || !/^https:\/\/127\.0\.0\.1:\d+$/.test(https))
      throw new Error('TLS fixture endpoints missing');
    const settings = {
      username: 'fixture',
      password: process.env.WAGO_FLEET_MQTT_PASSWORD,
      reconnectPeriod: 0,
      connectTimeout: 2000,
      rejectUnauthorized: true,
    };
    const trusted = await connectAsync(mqtts, { ...settings, ca, servername: 'localhost' });
    await trusted.endAsync(true);
    await expect(connectAsync(mqtts, settings)).rejects.toThrow();
    await expect(connectAsync(mqtts, { ...settings, ca, servername: 'wrong.invalid' })).rejects.toThrow();
    const config = {
      ...(await fixture.context.getMqttServerConfig(1))!,
      useTls: true,
      caCert: ca,
      tlsServername: 'localhost',
      managementPort: Number(new URL(https).port),
    };
    const management = new RabbitmqManagementClient();
    await expect(management.request(config, 'GET', '/overview')).resolves.toHaveProperty('rabbitmq_version');
    await expect(management.request({ ...config, caCert: undefined }, 'GET', '/overview')).rejects.toThrow();
    await expect(
      management.request({ ...config, tlsServername: 'wrong.invalid' }, 'GET', '/overview'),
    ).rejects.toThrow();
    await expect(management.request({ ...config, tlsInsecure: true }, 'GET', '/overview')).rejects.toThrow();
    const a = fixture.devices[0];
    await expect(
      management.request({ ...config, username: a.username, password: a.password }, 'GET', '/users'),
    ).rejects.toThrow();
    evidence.push(
      'MQTT and management TLS private CA verified; missing CA/wrong name/insecure management override denied; controller lacks management privileges',
    );
  });
});
