import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MqttClient } from 'mqtt';
import { JsonStateStore, WagoRuntime, type DiscoveryClaim, type Transport } from '../../cc100-runtime/src/runtime';
import { MemoryDeviceAdapter } from '../../cc100-runtime/src/io/adapters';
import { AssuranceFixture, delay, eventually } from './fixture';

jest.setTimeout(120_000);

it('retries interrupted credential handoff through broker authentication and rejects stale revisions and epochs', async () => {
  const fixture = new AssuranceFixture();
  const evidence: string[] = [];
  const output = process.env.WAGO_ASSURANCE_OUTPUT;
  try {
    await fixture.start(2);
    const username = `rotation-${randomUUID()}`;
    const hardwareId = 'rotation-retry';
    const root = `${fixture.prefix}/v1/controllers/${hardwareId}`;
    const topic = `${root}/credentials/rotate`;
    const policy = {
      mqttServerId: 1,
      identity: username,
      username,
      vhost: '/',
      topicPolicy: {
        publish: ['heartbeat', 'state', 'faults', 'acknowledgements', 'credentials/rotate/ack'].map(
          (suffix) => `${root}/${suffix}`,
        ),
        subscribe: [`${root}/commands`, `${root}/configuration/desired`, topic],
      },
    };
    const old = await fixture.provider.provision(policy);
    const store = new JsonStateStore(join(fixture.directory, 'rotation.json'));
    const credentials: DiscoveryClaim = {
      username,
      password: old.password,
      prefix: fixture.prefix,
      credentialEpoch: randomUUID(),
    };
    await store.save({ credentials, outputs: {}, commandIds: [] });
    let client: MqttClient;
    let runtime: WagoRuntime;
    let reconnects = 0;
    let delivered = 0;
    let interrupted = false;
    const acknowledgements: unknown[] = [];
    await fixture.backendClient.subscribeAsync(`${topic}/ack`, { qos: 1 });
    fixture.backendClient.on('message', (received, payload) => {
      if (received === `${topic}/ack`) acknowledgements.push(JSON.parse(payload.toString('utf8')));
    });
    const boot = async () => {
      const authenticated = (await store.load()).credentials!;
      client = await fixture.connect(authenticated.username, authenticated.password);
      const connection = client;
      const transport: Transport = {
        publish: async (name, value, options) => {
          await connection.publishAsync(name, JSON.stringify(value), { qos: 1, retain: options?.retain });
        },
        subscribe: async (name, listener) => {
          connection.on('message', (received, payload) => {
            if (received !== name) return;
            void Promise.resolve(listener(payload))
              .catch((error: unknown) => {
                if (!(error instanceof Error) || error.message !== 'injected interruption')
                  fixture.recordError('unexpected rotation callback failure');
              })
              .finally(() => {
                if (name === topic) delivered++;
              });
          });
          await connection.subscribeAsync(name, { qos: 1 });
        },
      };
      runtime = new WagoRuntime({
        hardwareId,
        prefix: fixture.prefix,
        pairingCode: 'fixture',
        store,
        transport,
        device: new MemoryDeviceAdapter(),
        reconnectCredentials: async (next) => {
          expect((await store.load()).credentials).toEqual(next);
          reconnects++;
          await connection.endAsync(true);
          if (!interrupted) {
            interrupted = true;
            throw new Error('injected interruption');
          }
          await boot();
        },
      });
      await runtime.start();
      // This invocation is bound to a completed CONNECT with the loaded secret.
      await runtime.acknowledgeCredentialRotation(authenticated);
    };
    await boot();
    const replacement = await fixture.provider.rotate(policy);
    const input = {
      username,
      password: replacement.password,
      revision: 2,
      token: 'a'.repeat(43),
      credentialEpoch: credentials.credentialEpoch,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };
    const send = async (value: unknown) => {
      const before = delivered;
      await fixture.backendClient.publishAsync(topic, JSON.stringify(value), { qos: 1 });
      await eventually(() => delivered > before);
    };
    await send(input);
    expect(interrupted).toBe(true);
    expect(acknowledgements).toEqual([]);
    expect((await store.load()).credentialRotation?.revision).toBe(2);
    await expect(fixture.connect(username, old.password)).rejects.toThrow();
    await boot();
    await eventually(() => acknowledgements.length === 1);
    expect(acknowledgements[0]).toEqual({
      revision: 2,
      token: input.token,
      credentialEpoch: input.credentialEpoch,
      status: 'reconnected',
    });
    evidence.push(
      'interruption after durable secret and revision save produces no acknowledgement; process restart authenticates replacement secret and acknowledges retained rotation',
    );
    await send({ ...input, revision: 1 });
    await send({ ...input, revision: 3, credentialEpoch: randomUUID() });
    await send({ ...input, token: 'b'.repeat(43) });
    expect(reconnects).toBe(1);
    expect((await store.load()).credentialRotation).toEqual({ revision: 2, token: input.token });
    expect(acknowledgements).toHaveLength(1);
    evidence.push(
      'broker-delivered stale revision, mismatched epoch and conflicting same-revision token rejected without persistence or reconnect',
    );
    await send(input);
    await eventually(() => acknowledgements.length === 2);
    expect(reconnects).toBe(2);
    await client!.endAsync(true);
    await boot();
    await eventually(() => acknowledgements.length === 3);
    expect(acknowledgements.every((ack) => JSON.stringify(ack) === JSON.stringify(acknowledgements[0]))).toBe(true);
    await delay(100);
    expect(fixture.errors).toEqual([]);
    evidence.push(
      'identical rotation retry and second process restart authenticate replacement connection and publish the same revision/token/epoch receipt',
    );
  } finally {
    await fixture.close();
    if (output)
      await writeFile(
        join(output, 'rotation.json'),
        JSON.stringify({ evidenceClass: 'real-loopback-broker-software-fixtures', assertions: evidence }, null, 2),
      );
  }
});
