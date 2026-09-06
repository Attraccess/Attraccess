import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import type { PluginContext, PluginMqttMessage } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './wago-controller.entity';
import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';
import { WagoCredentialRotation1780010610000 } from './wago-credential-rotation.migration';
import { WagoCredentialRotationService, WagoCredentialRotationUncertainError } from './wago-credential-rotation';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { WagoRuntime, type RuntimeState } from '../cc100-runtime/src/runtime';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { MemoryDeviceAdapter } from '../cc100-runtime/src/adapters';

describe('credential rotation with isolated SQLite and fixture broker transport', () => {
  let db: DataSource;
  let directory: string;
  let service: WagoCredentialRotationService;
  let context: PluginContext;
  let receive: (message: PluginMqttMessage) => void | Promise<void>;
  let owned: boolean;
  let abort: AbortController;
  const principal = { userId: 12, authenticationMethod: 'session' as const };
  const identity = 'wago-controller-fixture';
  const credentialEpoch = '11111111-1111-4111-8111-111111111111';
  const credential = {
    providerId: 'fixture',
    identity,
    username: identity,
    password: 'synthetic-rotation-secret',
    vhost: '/',
  };
  const rotate = jest.fn();
  const publish = jest.fn();
  const record = jest.fn();
  const unsubscribe = jest.fn();
  const guard = () => ({
    assertOwned: async () => {
      if (!owned) throw new Error('lease_lost');
    },
    signal: abort.signal,
    deadline: Date.now() + 60_000,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    owned = true;
    abort = new AbortController();
    directory = await mkdtemp(join(tmpdir(), 'wago-rotation-database-'));
    db = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'rotation.sqlite'),
      entities: [WagoController, WagoCredentialRotationEntity],
      synchronize: true,
    }).initialize();
    await db.getRepository(WagoController).save({
      id: 1,
      hardwareId: 'fixture',
      trustState: 'claimed',
      mqttServerId: 2,
      name: 'Fixture',
      pairingCodeHash: '',
      protocolVersion: '1.0.0',
      runtimeVersion: '0.1.0',
      capabilities: '["credential-rotation-v1"]',
      credentialEpoch,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const key = randomBytes(32);
    context = {
      getRepository: (entity) => db.getRepository(entity),
      getMqttCredentialProvisioning: () => ({ rotate }),
      mqtt: {
        publish,
        subscribe: async (_server, _topic, handler) => {
          receive = handler;
          return { unsubscribe };
        },
      },
      audit: { record },
      logger: { warn: jest.fn() },
      secrets: {
        encrypt: (plaintext) => {
          const iv = randomBytes(12);
          const cipher = createCipheriv('aes-256-gcm', key, iv);
          const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
          return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
        },
        decrypt: (encrypted) => {
          const bytes = Buffer.from(encrypted, 'base64');
          const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
          decipher.setAuthTag(bytes.subarray(12, 28));
          return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
        },
      },
    } as unknown as PluginContext;
    rotate.mockResolvedValue(credential);
    record.mockResolvedValue({ status: 'recorded' });
    publish.mockImplementation(async (serverId, topic, payload) => {
      const { revision, token } = JSON.parse(payload);
      await receive({
        serverId,
        topic: `${topic}/ack`,
        payload: Buffer.from(JSON.stringify({ revision, token, credentialEpoch, status: 'reconnected' })),
      });
    });
    service = new WagoCredentialRotationService(context);
  });
  afterEach(async () => {
    jest.useRealTimers();
    await db.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  const row = () =>
    db
      .getRepository(WagoCredentialRotationEntity)
      .createQueryBuilder('rotation')
      .addSelect('rotation.encryptedCredentials')
      .getOne();

  it('persists encrypted handoff before dispatch and finishes only after matching reconnect acknowledgement', async () => {
    let acknowledge!: () => Promise<void>;
    let started!: () => void;
    const dispatched = new Promise<void>((resolve) => {
      started = resolve;
    });
    publish.mockImplementation(async (serverId, topic, payload, options) => {
      expect(options).toEqual({ qos: 1, retain: false });
      const persisted = await row();
      expect(persisted?.phase).toBe('pending');
      expect(persisted?.encryptedCredentials).not.toContain(credential.password);
      const { revision, token } = JSON.parse(payload);
      acknowledge = async () => {
        await receive({
          serverId,
          topic: `${topic}/ack`,
          payload: Buffer.from(JSON.stringify({ revision, token, credentialEpoch, status: 'reconnected' })),
        });
      };
      await receive({
        serverId,
        topic: `${topic}/ack`,
        payload: Buffer.from(JSON.stringify({ revision, token: 'wrong', credentialEpoch, status: 'reconnected' })),
      });
      started();
    });
    const operation = service.rotate(1, 'attraccess/wago', principal, guard());
    await dispatched;
    expect((await row())?.phase).toBe('pending');
    expect(record.mock.calls.map(([event]) => event.outcome)).not.toContain('succeeded');
    await acknowledge();
    await expect(operation).resolves.toEqual({ state: 'completed', revision: 1 });
    expect(await row()).toMatchObject({ phase: 'completed', encryptedCredentials: null });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(record.mock.calls)).not.toContain(credential.password);
    expect(rotate).toHaveBeenCalledWith(
      expect.objectContaining({
        topicPolicy: expect.objectContaining({
          subscribe: expect.arrayContaining(['attraccess/wago/v1/controllers/fixture/credentials/rotate']),
        }),
      }),
    );
  });

  it('times out, then retries the same durable credential and token after service restart without rotating again', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    let started!: () => void;
    const dispatched = new Promise<void>((resolve) => {
      started = resolve;
    });
    publish.mockImplementation(async () => {
      started();
    });
    const operation = service.rotate(1, 'attraccess/wago', principal, guard());
    const failure = expect(operation).rejects.toBeInstanceOf(WagoCredentialRotationUncertainError);
    await dispatched;
    const firstPayload = publish.mock.calls[0][2];
    await jest.advanceTimersByTimeAsync(30_000);
    await failure;
    expect((await row())?.phase).toBe('pending');
    jest.useRealTimers();
    await db.destroy();
    db = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'rotation.sqlite'),
      entities: [WagoController, WagoCredentialRotationEntity],
      synchronize: false,
    }).initialize();
    publish.mockImplementation(async (serverId, topic, payload) => {
      const retried = JSON.parse(payload);
      const first = JSON.parse(firstPayload);
      expect({ ...retried, expiresAt: first.expiresAt }).toEqual(first);
      expect(Date.parse(retried.expiresAt)).toBeGreaterThan(Date.now());
      const { revision, token } = JSON.parse(payload);
      await receive({
        serverId,
        topic: `${topic}/ack`,
        payload: Buffer.from(JSON.stringify({ revision, token, credentialEpoch, status: 'reconnected' })),
      });
    });
    await expect(
      new WagoCredentialRotationService(context).rotate(1, 'attraccess/wago', principal, guard(), true),
    ).resolves.toEqual({ state: 'completed', revision: 1 });
    expect(rotate).toHaveBeenCalledTimes(1);
  });

  it('preserves uncertain provisioning and refuses to repeat provider mutation after ownership loss', async () => {
    rotate.mockImplementation(async () => {
      owned = false;
      return credential;
    });
    await expect(service.rotate(1, 'attraccess/wago', principal, guard())).rejects.toThrow('incomplete');
    expect(await row()).toMatchObject({ phase: 'provisioning', encryptedCredentials: null });
    expect(publish).not.toHaveBeenCalled();
    owned = true;
    await expect(service.rotate(1, 'attraccess/wago', principal, guard(), true)).rejects.toThrow('uncertain');
    expect(rotate).toHaveBeenCalledTimes(1);
  });

  it('does not finish after lease loss during the handoff', async () => {
    publish.mockImplementation(async () => {
      owned = false;
      abort.abort();
    });
    await expect(service.rotate(1, 'attraccess/wago', principal, guard())).rejects.toThrow('incomplete');
    expect((await row())?.phase).toBe('pending');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('refuses old runtime capabilities before touching broker credentials or audit', async () => {
    await db.getRepository(WagoController).update(1, { capabilities: '["commands"]' });
    await expect(service.rotate(1, 'attraccess/wago', principal, guard())).rejects.toThrow('credential-rotation-v1');
    expect(rotate).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(await row()).toBeNull();
  });

  it('requires the persisted registration epoch before any broker mutation', async () => {
    await db.query('UPDATE plugin_wago_controllers SET credential_epoch = NULL WHERE id = 1');
    await expect(service.rotate(1, 'attraccess/wago', principal, guard())).rejects.toThrow('credential epoch');
    expect(rotate).not.toHaveBeenCalled();
  });

  it('returns the typed uncertain error when MQTT dispatch stalls past its deadline', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    let entered!: () => void;
    let finish!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    publish.mockImplementation(async () => {
      entered();
      await pending;
    });
    const operation = service.rotate(1, 'attraccess/wago', principal, guard());
    const rejected = expect(operation).rejects.toBeInstanceOf(WagoCredentialRotationUncertainError);
    await started;
    const payload = JSON.parse(publish.mock.calls[0][2]);
    expect(Date.parse(payload.expiresAt) - Date.now()).toBeLessThanOrEqual(30_000);
    await jest.advanceTimersByTimeAsync(30_000);
    await rejected;
    finish();
    expect((await row())?.phase).toBe('pending');
  });

  it('does not call manual instructions a completed rotation', async () => {
    rotate.mockResolvedValue({ username: identity, instructions: ['synthetic-manual-instruction'] });
    await expect(service.rotate(1, 'attraccess/wago', principal, guard())).rejects.toThrow('incomplete');
    expect(await row()).toBeNull();
    expect(publish).not.toHaveBeenCalled();
    expect(JSON.stringify(record.mock.calls)).not.toContain('synthetic-manual-instruction');
  });

  it('guards original-broker removal and rejects downgrade of any rotation history', async () => {
    await service.rotate(1, 'attraccess/wago', principal, guard());
    await expect(service.assertRemovalBroker(1, 9)).rejects.toThrow('original rotation broker');
    await expect(service.assertRemovalBroker(1, 2)).resolves.toBeUndefined();
    const runner = db.createQueryRunner();
    await expect(new WagoCredentialRotation1780010610000().down(runner)).rejects.toThrow('rotation history');
    expect((await row())?.revision).toBe(1);
    await runner.release();
  });

  it('creates the actual migration and clears recovery state only when its controller registration is deleted', async () => {
    const runner = db.createQueryRunner();
    await runner.query('DROP TABLE "plugin_wago_credential_rotations"');
    await runner.query('ALTER TABLE plugin_wago_controllers DROP COLUMN credential_epoch');
    const migration = new WagoCredentialRotation1780010610000();
    await migration.up(runner);
    await db.query('UPDATE plugin_wago_controllers SET credential_epoch = ? WHERE id = 1', [credentialEpoch]);
    await service.rotate(1, 'attraccess/wago', principal, guard());
    expect(await service.status(1)).toEqual({ state: 'completed', revision: 1 });
    await expect(migration.down(runner)).rejects.toThrow('rotation history');
    await db.getRepository(WagoController).delete(1);
    expect(await row()).toBeNull();
    await migration.down(runner);
    await runner.release();
  });

  it('composes the real backend and runtime across persistence, fixture authentication and reconnect acknowledgement', async () => {
    let persisted: RuntimeState = {
      credentials: { username: identity, password: 'old-fixture', prefix: 'attraccess/wago', credentialEpoch },
      outputs: {},
      commandIds: [],
    };
    const listeners = new Map<string, (payload: Buffer) => void | Promise<void>>();
    let authenticatedPassword = 'old-fixture';
    const runtime = new WagoRuntime({
      hardwareId: 'fixture',
      prefix: 'attraccess/wago',
      pairingCode: 'fixture',
      store: {
        load: async () => structuredClone(persisted),
        save: async (state) => {
          persisted = structuredClone(state);
        },
      },
      device: new MemoryDeviceAdapter(),
      transport: {
        subscribe: async (topic, handler) => {
          listeners.set(topic, handler);
        },
        publish: async (topic, payload) => {
          if (topic.endsWith('/credentials/rotate/ack')) {
            expect(authenticatedPassword).toBe(credential.password);
            await receive({ serverId: 2, topic, payload: Buffer.from(JSON.stringify(payload)) });
          }
        },
      },
      reconnectCredentials: async (next) => {
        expect(persisted.credentials).toEqual(next);
        // Fixture authentication accepts only the password actually returned by the broker mutation.
        if (next.password !== credential.password) throw new Error('fixture_authentication_failed');
        authenticatedPassword = next.password;
        await runtime.acknowledgeCredentialRotation(next);
      },
    });
    await runtime.start();
    publish.mockImplementation(async (_serverId, topic, payload) => {
      await listeners.get(topic)?.(Buffer.from(payload));
    });
    await expect(service.rotate(1, 'attraccess/wago', principal, guard())).resolves.toEqual({
      state: 'completed',
      revision: 1,
    });
    expect(persisted.credentials?.password).toBe(credential.password);
    expect((await row())?.encryptedCredentials).toBeNull();
  });
});
