/* eslint-disable @nx/enforce-module-boundaries -- Recovery composes production persistence and encryption in owned fixtures. */
import { randomUUID } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../../../../api/src/encryption/encryption.service';
import { WagoManagedAccess } from '../../backend/runtime/managed/access.entity';
import { JsonStateStore, WagoRuntime, hash } from '../../cc100-runtime/src/runtime';
import { MemoryDeviceAdapter } from '../../cc100-runtime/src/io/adapters';
import { AssuranceFixture, eventually, snapshot } from './fixture';

jest.setTimeout(120_000);
const output = process.env.WAGO_ASSURANCE_OUTPUT ?? '';
const encryptor = (secret: string) =>
  new EncryptionService(new ConfigService({ app: { AUTH_SESSION_SECRET: secret } }));

describe('isolated recovery using existing state and credential services', () => {
  const fixture = new AssuranceFixture();
  const results: Array<{ exercise: string; milliseconds: number; boundary: string }> = [];
  beforeAll(async () => fixture.start(2));
  afterAll(async () => {
    await fixture.close();
    if (output)
      await writeFile(
        join(output, 'recovery.json'),
        JSON.stringify(
          {
            evidenceClass: 'software-fixtures-only',
            results,
            unrun: [
              'physical power loss',
              'real SSH recovery',
              'replacement wiring',
              'on-device signed upgrade/rollback',
              'I/O and Modbus observations',
            ],
          },
          null,
          2,
        ),
      );
  });

  it('restores a consistent database, runtime state and encrypted management secret with the original recovery key', async () => {
    const start = Date.now();
    const secret = randomUUID();
    const encryption = encryptor(secret);
    const credential = JSON.stringify({ privateKey: 'isolated-ssh-fixture-only', token: randomUUID() });
    await fixture.database.getRepository(WagoManagedAccess).save({
      sessionId: 51,
      controllerId: fixture.devices[0].id,
      host: 'fixture.invalid',
      fingerprint: 'fixture-only',
      token: randomUUID(),
      state: 'managed',
      encryptedCredentials: encryption.encryptForPlugin('wago', credential),
      keyFingerprint: 'fixture-only',
    });
    await fixture.command(fixture.devices[0]);
    await fixture.fresh();
    fixture.backend.onModuleDestroy();
    await Promise.all(fixture.devices.map((device) => device.client.endAsync(true)));
    await fixture.database.destroy();
    const database = join(fixture.directory, 'database.sqlite');
    const backup = join(fixture.directory, 'database.backup');
    await copyFile(database, backup);
    const runtimeBackups = await Promise.all(
      fixture.devices.map(async (device) => ({ device, state: await device.store.load() })),
    );
    // Simulate loss only after all writers have stopped; never copy a live SQLite file.
    await writeFile(database, 'lost');
    for (const { device } of runtimeBackups)
      await writeFile(join(fixture.directory, `${device.hardwareId}.json`), 'corrupt');
    await copyFile(backup, database);
    await fixture.database.initialize();
    const restored = await fixture.database
      .getRepository(WagoManagedAccess)
      .createQueryBuilder('access')
      .addSelect('access.encryptedCredentials')
      .where('access.sessionId = :id', { id: 51 })
      .getOneOrFail();
    expect(encryption.decryptForPlugin('wago', restored.encryptedCredentials)).toBe(credential);
    expect(() => encryptor(randomUUID()).decryptForPlugin('wago', restored.encryptedCredentials)).toThrow();
    for (const { device, state } of runtimeBackups) {
      await device.store.save(state);
      await fixture.startDevice(device);
      expect((await device.store.load()).accepted?.contentHash).toBe(hash(snapshot));
      expect((await device.store.load()).commandIds).toEqual(state.commandIds);
    }
    await fixture.startBackend();
    await fixture.fresh();
    await fixture.command(fixture.devices[0]);
    results.push({
      exercise: 'configuration/runtime restoration and isolated disaster recovery',
      milliseconds: Date.now() - start,
      boundary:
        'all writes drained before snapshot; no acknowledged commands lost before snapshot; key required; no real SSH or host backup proven',
    });
  });

  it('replaces a compromised identity and rejects the old secret after replacement', async () => {
    const start = Date.now();
    const device = fixture.devices[0];
    const old = { username: device.username, password: device.password };
    device.client.options.reconnectPeriod = 0;
    await fixture.provider.revoke({ mqttServerId: 1, identity: old.username, username: old.username, vhost: '/' });
    await eventually(() => !device.client.connected);
    const username = `replacement-${randomUUID()}`;
    const root = `${fixture.prefix}/v1/controllers/${device.hardwareId}`;
    const credential = await fixture.provider.provision({
      mqttServerId: 1,
      identity: username,
      username,
      vhost: '/',
      topicPolicy: {
        publish: ['heartbeat', 'state', 'faults', 'acknowledgements', 'configuration/reported'].map(
          (suffix) => `${root}/${suffix}`,
        ),
        subscribe: [`${root}/commands`, `${root}/configuration/desired`],
      },
    });
    const state = await device.store.load();
    device.username = username;
    device.password = credential.password;
    await device.store.save({
      ...state,
      credentials: { username, password: credential.password, prefix: fixture.prefix, credentialEpoch: randomUUID() },
    });
    await fixture.startDevice(device);
    await expect(fixture.connect(old.username, old.password)).rejects.toThrow();
    await fixture.fresh();
    await fixture.command(device);
    results.push({
      exercise: 'credential compromise and controller identity replacement',
      milliseconds: Date.now() - start,
      boundary: 'old authenticated sessions closed; new epoch and identity operate; physical replacement/wiring unrun',
    });
  });

  it('refuses corrupt persistence and fails a command before writing when persistence is unavailable', async () => {
    const path = join(fixture.directory, 'corrupt.json');
    await writeFile(path, '{invalid');
    const store = new JsonStateStore(path);
    const device = new MemoryDeviceAdapter();
    const write = jest.spyOn(device, 'write');
    const transport = { publish: async () => undefined, subscribe: async () => undefined };
    const runtime = new WagoRuntime({
      hardwareId: 'corrupt',
      prefix: fixture.prefix,
      pairingCode: 'fixture',
      store,
      transport,
      device,
    });
    await expect(runtime.start()).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
    const active = fixture.devices[1];
    const before = await active.store.load();
    const persist = jest.spyOn(active.store, 'save').mockRejectedValueOnce(new Error('unavailable persistence'));
    await expect(
      active.runtime.receiveCommand(
        Buffer.from(
          JSON.stringify({
            id: randomUUID(),
            channelId: 'out',
            action: 'set',
            value: true,
            expectedConfigurationRevision: 1,
            expiresAt: new Date(Date.now() + 3000).toISOString(),
          }),
        ),
      ),
    ).rejects.toThrow('unavailable persistence');
    persist.mockRestore();
    expect((await active.store.load()).outputs).toEqual(before.outputs);
    results.push({
      exercise: 'unavailable/corrupt persistence',
      milliseconds: 0,
      boundary: 'startup rejects corrupt state; command persistence failure cannot actuate output',
    });
  });
});
