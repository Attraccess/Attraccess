import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { DataSource } from 'typeorm';
import type { PluginContext, PluginMqttMessage } from '@attraccess/plugins-backend-sdk';
import { WagoNetworkChangeService, networkChangeInput } from './wago-network-change.service';
import { WagoNetworkChange, WagoMqttCredentialRetirement } from './wago-network-change.entity';
import { WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoService } from './wago.service';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { RuntimeUpdateError } from './wago-runtime-update';
import { managedSsh } from './wago-managed-ssh';
import { managedHostHelper } from './wago-managed-helper';
import { MANAGED_HELPER_PROTOCOL } from './wago-managed-installer';
import type { BuildRuntimeArtifact } from './wago-build-runtime';
import { WagoDeviceOperations } from './wago-device-operations';
import { WagoNetworkChanges1780010660000 } from './migrations/1780010660000-add-wago-network-changes';

jest.mock('@attraccess/plugins-backend-sdk', () => jest.requireActual('typeorm'));
jest.mock('./wago.service', () => ({ WagoService: class {} }));
jest.mock('./wago-runtime-artifacts', () => ({ WagoRuntimeArtifactsService: class {} }));
jest.mock('./wago-commissioning-readiness', () => ({ WagoCommissioningReadiness: class {} }));
jest.mock('./wago-managed-ssh', () => ({ managedSsh: jest.fn() }));
jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

const artifact = {
  imageId: `sha256:${'1'.repeat(64)}`,
  image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'2'.repeat(64)}`,
  buildId: '3'.repeat(40),
  digest: '4'.repeat(64),
  bytes: 81920,
  manifest: {
    schemaVersion: 1,
    runtime: 'attraccess-wago-cc100',
    runtimeVersion: '0.1.0',
    protocolVersion: '1.0.0',
    hardware: {
      model: '751-9301',
      platform: 'linux/arm/v7',
      firmwareBaseline: '31',
      profile: 'cc100-751-9301-fw31-digital-v1',
    },
  },
} as BuildRuntimeArtifact;
const principal = { userId: 7, authenticationMethod: 'session' as const };
const oldHost = '10.77.0.7',
  newHost = '192.168.2.50',
  fingerprint = `SHA256:${'a'.repeat(43)}`;

describe('SSH MQTT/address changes with disconnected previous destinations', () => {
  let db: DataSource, managed: WagoManagedRuntimeService, service: WagoNetworkChangeService, context: PluginContext;
  let listener: (message: PluginMqttMessage) => void,
    payloads: Buffer[],
    provision: jest.Mock,
    audit: jest.Mock,
    revoke: jest.Mock;
  let failure: 'host_identity' | 'apply' | 'ack' | null, allowEvidence: boolean, brokerHost: string;
  let wago: {
    getSettings: jest.Mock;
    registerRuntimeStatusHandler: jest.Mock;
    blockRuntime: jest.Mock;
    refreshNetworkConnection: jest.Mock;
  };
  beforeEach(async () => {
    db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: [
        WagoNetworkChange,
        WagoMqttCredentialRetirement,
        WagoManagedAccess,
        WagoRuntimeUpdateEntity,
        WagoDeviceOperation,
        WagoController,
        WagoCommissioningSession,
        WagoCredentialRotationEntity,
      ],
    }).initialize();
    payloads = [];
    failure = null;
    allowEvidence = true;
    brokerHost = 'new-broker.test';
    jest
      .mocked(lookup)
      .mockImplementation(
        async (host: string) =>
          [{ address: host === 'unreachable-old.test' ? '192.168.3.10' : '192.168.4.10', family: 4 }] as never,
      );
    provision = jest.fn(async () => ({
      username: 'wago-controller-cc100-1',
      password: 'device-password-secret',
      providerId: 'fixture',
      identity: 'wago-controller-cc100-1',
      vhost: '/',
    }));
    revoke = jest.fn(async () => {
      throw new Error('unreachable-old-broker');
    });
    audit = jest.fn(async () => ({ status: 'recorded' }));
    context = {
      getRepository: (entity: never) => db.getRepository(entity),
      secrets: {
        encrypt: (s: string) => Buffer.from(s).toString('base64'),
        decrypt: (s: string) => Buffer.from(s, 'base64').toString(),
      },
      getMqttServerConfig: jest.fn(async (id: number) => ({
        id,
        host: id === 1 ? 'unreachable-old.test' : brokerHost,
        port: 1883,
        useTls: false,
      })),
      getMqttCredentialProvisioning: () => ({ provision, revoke }),
      audit: { record: audit },
      logger: { warn: jest.fn() },
      mqtt: {
        refreshConnection: jest.fn(async () => undefined),
        publish: jest.fn(async () => undefined),
        subscribe: jest.fn(async (_id, _topic, handler) => {
          listener = handler;
          return { unsubscribe: jest.fn() };
        }),
      },
    } as unknown as PluginContext;
    wago = {
      getSettings: jest.fn(async () => ({ operationalPrefix: 'attraccess/wago' })),
      registerRuntimeStatusHandler: jest.fn(),
      blockRuntime: jest.fn(),
      refreshNetworkConnection: jest.fn(async () => undefined),
    };
    managed = new WagoManagedRuntimeService(
      context,
      wago as unknown as WagoService,
      { current: async () => artifact } as WagoRuntimeArtifactsService,
      {} as WagoCommissioningReadiness,
    );
    jest.spyOn(managed as unknown as { scan(): Promise<void> }, 'scan').mockResolvedValue(undefined);
    managed.onApplicationBootstrap();
    managed.registerRootProbe(async () => true);
    const session = await db.getRepository(WagoCommissioningSession).save({
      id: 1,
      hardwareId: 'cc100-1',
      mqttServerId: 1,
      targetHost: oldHost,
      hostKeyFingerprint: fingerprint,
      firmwareBaseline: '31',
      state: 'completed',
      auditLog: '[]',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    jest
      .mocked(managedSsh)
      .mockImplementation(async (_access, _key, header) =>
        header.startsWith('proof ') ? `OK ${header.split(' ')[1]}\n` : 'OK\n',
      );
    await managed.enrol(session, async () => 'OK\n', new AbortController().signal);
    await managed.bind(1, 1);
    await db.getRepository(WagoManagedAccess).update(1, { state: 'managed' });
    await db.getRepository(WagoController).save({
      id: 1,
      hardwareId: 'cc100-1',
      trustState: 'claimed',
      name: 'Workshop',
      mqttServerId: 1,
      credentialMqttServerId: 1,
      credentialEpoch: '11111111-1111-4111-8111-111111111111',
      enrollmentId: 42,
      pairingCodeHash: 'pin',
      fingerprint,
      protocolVersion: '1.0.0',
      runtimeVersion: '0.1.0',
      capabilities: '[]',
      lastSequence: 300,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    jest
      .mocked(managedSsh)
      .mockClear()
      .mockImplementation(async (access, _key, header, _signal, file) => {
        if (access.host === oldHost) throw new RuntimeUpdateError('offline');
        if (failure === 'host_identity') throw new RuntimeUpdateError('host_identity');
        if (header.startsWith('proof ')) return `OK ${header.split(' ')[1]}\n`;
        if (header.startsWith('inspect '))
          return `${MANAGED_HELPER_PROTOCOL}\n${createHash('sha256').update(managedHostHelper(artifact)).digest('hex')}\n${artifact.imageId} false\n`;
        if (header.startsWith('mqtt-apply ')) {
          payloads.push(file as Buffer);
          if (failure === 'apply') throw new RuntimeUpdateError('offline');
          const payload = JSON.parse((file as Buffer).toString());
          if (allowEvidence)
            listener({
              serverId: payload.mqttServerId,
              topic: `${payload.prefix}/v1/controllers/${payload.hardwareId}/credentials/rotate/ack`,
              payload: Buffer.from(
                JSON.stringify({
                  revision: 1,
                  token: payload.token,
                  credentialEpoch: payload.credentialEpoch,
                  status: 'reconnected',
                }),
              ),
            });
        }
        if (header.startsWith('mqtt-ack ') && failure === 'ack') throw new RuntimeUpdateError('offline');
        return 'OK\n';
      });
    service = new WagoNetworkChangeService(context, managed, wago as unknown as WagoService);
  });
  afterEach(async () => {
    await managed.onModuleDestroy();
    await db.destroy();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('changes only the stored address using new-IP SSH, without the old IP, broker, heartbeat or credentials', async () => {
    const result = await service.apply(1, { targetHost: newHost, mqttServerId: null }, principal);
    expect(result).toMatchObject({ targetHost: newHost, mqttServerId: 1, operation: { phase: 'completed' } });
    expect(provision).not.toHaveBeenCalled();
    expect(context.mqtt.refreshConnection).not.toHaveBeenCalled();
    expect(wago.blockRuntime).not.toHaveBeenCalled();
    expect(context.getMqttServerConfig).not.toHaveBeenCalled();
    expect(payloads).toEqual([]);
    for (const [access] of jest.mocked(managedSsh).mock.calls)
      expect(access).toMatchObject({ host: newHost, fingerprint });
    expect(await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).toMatchObject({
      targetHost: newHost,
      mqttServerId: 1,
      state: 'completed',
    });
    const envelope = await db
      .getRepository(WagoManagedAccess)
      .createQueryBuilder('a')
      .addSelect('a.encryptedCredentials')
      .getOne();
    if (!envelope) throw new Error('Missing managed envelope');
    expect(JSON.parse(context.secrets.decrypt(envelope.encryptedCredentials)).host).toBe(newHost);
  });

  it('rejects an older host before changing broker credentials when shared-connection refresh is unavailable', async () => {
    context.mqtt.refreshConnection = undefined;
    await expect(service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal)).rejects.toThrow('incomplete');
    expect(provision).not.toHaveBeenCalled();
    expect(payloads).toEqual([]);
    expect(await service.status(1)).toMatchObject({
      mqttServerId: 1,
      targetHost: oldHost,
      operation: { failure: 'host_connection' },
    });
  });

  it.each([1, 2])(
    'refreshes the same server or migrates broker %i using device credentials and consistent associations',
    async (mqttServerId) => {
      if (mqttServerId === 1)
        jest.mocked(context.getMqttServerConfig).mockResolvedValueOnce({
          id: 1,
          name: 'Current server',
          host: 'refreshed-current.test',
          port: 1883,
          useTls: false,
          username: 'admin',
          password: 'broker-management-secret',
          clientId: null,
        });
      const result = await service.apply(1, { targetHost: newHost, mqttServerId }, principal);
      expect(result).toMatchObject({ targetHost: newHost, mqttServerId, operation: { phase: 'completed' } });
      const payload = JSON.parse(payloads[0].toString());
      expect(payload.url).toBe(`mqtt://${mqttServerId === 1 ? 'refreshed-current.test' : brokerHost}:1883`);
      expect(provision).toHaveBeenCalledWith(
        expect.objectContaining({ mqttServerId, identity: 'wago-controller-cc100-1' }),
      );
      expect(context.mqtt.refreshConnection).toHaveBeenCalledWith(mqttServerId);
      expect(await db.getRepository(WagoController).findOneByOrFail({ id: 1 })).toMatchObject({
        mqttServerId,
        credentialMqttServerId: mqttServerId,
        credentialEpoch: payload.credentialEpoch,
        enrollmentId: 42,
        name: 'Workshop',
        lastSequence: 300,
      });
      expect(await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).toMatchObject({
        mqttServerId,
        targetHost: newHost,
        state: 'completed',
      });
      expect(await db.getRepository(WagoCredentialRotationEntity).findOneByOrFail({ controllerId: 1 })).toMatchObject({
        mqttServerId,
        phase: 'completed',
        credentialEpoch: payload.credentialEpoch,
      });
      expect(result.pendingCredentialRetirements).toBe(mqttServerId === 1 ? 0 : 1);
      expect(JSON.stringify(result) + JSON.stringify(audit.mock.calls)).not.toContain('device-password-secret');
      expect(revoke).not.toHaveBeenCalled();
      expect(wago.refreshNetworkConnection).toHaveBeenCalledWith(1);
    },
  );

  it('rejects a different pinned SSH host key before provisioning or storing a new address', async () => {
    failure = 'host_identity';
    await expect(service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal)).rejects.toThrow('incomplete');
    expect(provision).not.toHaveBeenCalled();
    expect(await service.status(1)).toMatchObject({
      targetHost: oldHost,
      mqttServerId: 1,
      operation: { failure: 'host_identity' },
    });
  });

  it('recovers interrupted apply after process restart with the exact saved credentials', async () => {
    failure = 'apply';
    await expect(service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal)).rejects.toThrow('incomplete');
    await expect(managed.assertNetworkSettled(1)).rejects.toThrow('pending');
    expect(await service.status(1)).toMatchObject({ targetHost: oldHost, mqttServerId: 1 });
    failure = null;
    brokerHost = 'subsequent-edit.test';
    const transport = jest.mocked(managedSsh).getMockImplementation();
    if (!transport) throw new Error('Missing SSH fixture');
    jest.mocked(managedSsh).mockImplementation((...args) => {
      if (args[2].startsWith('inspect ')) throw new RuntimeUpdateError('offline'); // Container was deleted before interruption.
      return transport(...args);
    });
    const restarted = new WagoNetworkChangeService(context, managed, wago as unknown as WagoService);
    expect(await restarted.apply(1, null, principal, true)).toMatchObject({
      mqttServerId: 2,
      operation: { phase: 'completed' },
    });
    expect(provision).toHaveBeenCalledTimes(1);
    expect(payloads[1]).toEqual(payloads[0]);
  });

  it('refreshes corrected broker settings after failed verification and retains the replacement across interruption', async () => {
    allowEvidence = false;
    const originalTimeout = setTimeout;
    const timeout = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((callback, milliseconds, ...args) =>
        originalTimeout(callback, milliseconds === 120_000 ? 1 : milliseconds, ...args),
      );
    const first = service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal);
    const rejected = expect(first).rejects.toThrow('incomplete');
    await rejected;
    timeout.mockRestore();
    expect((await service.status(1)).operation).toMatchObject({ phase: 'verifying', failure: 'broker_verification' });
    const previousDigest = createHash('sha256').update(payloads[0]).digest('hex');
    brokerHost = 'corrected-broker.test';
    provision.mockResolvedValueOnce({ username: 'wago-controller-cc100-1', password: 'replacement-device-secret' });
    failure = 'apply';
    const restarted = new WagoNetworkChangeService(context, managed, wago as unknown as WagoService);
    await expect(restarted.apply(1, null, principal, true)).rejects.toThrow('incomplete');
    const replacement = JSON.parse(payloads[1].toString());
    expect(replacement).toMatchObject({
      url: 'mqtt://corrected-broker.test:1883',
      password: 'replacement-device-secret',
      supersededDigest: previousDigest,
    });
    expect(replacement.operationToken).not.toBe(JSON.parse(payloads[0].toString()).operationToken);
    expect(
      jest
        .mocked(managedSsh)
        .mock.calls.some(
          (call) =>
            call[2] ===
            `mqtt-release ${call[0].token} ${previousDigest} ${createHash('sha256').update(payloads[1]).digest('hex')}`,
        ),
    ).toBe(true);
    failure = null;
    allowEvidence = true;
    brokerHost = 'another-edit.test'; // An interrupted recreation must finish its durable replacement first.
    expect(await restarted.apply(1, null, principal, true)).toMatchObject({ operation: { phase: 'completed' } });
    expect(payloads[2]).toEqual(payloads[1]);
    expect(provision).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(await service.status(1)) + JSON.stringify(audit.mock.calls)).not.toContain(
      'replacement-device-secret',
    );
  });

  it('recovers an ambiguous acknowledgement after atomic address and broker commit', async () => {
    failure = 'ack';
    await expect(service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal)).rejects.toThrow('incomplete');
    expect(await service.status(1)).toMatchObject({
      targetHost: newHost,
      mqttServerId: 2,
      operation: { phase: 'saving' },
    });
    failure = null;
    await service.apply(1, null, principal, true);
    expect(payloads).toHaveLength(1);
    expect(provision).toHaveBeenCalledTimes(1);
    expect(await db.getRepository(WagoNetworkChange).findOneByOrFail({ controllerId: 1 })).toMatchObject({
      phase: 'completed',
    });
  });

  it('excludes commissioning, updates, rotation and recovery using the shared device lease', async () => {
    const operations = new WagoDeviceOperations(db.getRepository(WagoDeviceOperation));
    await operations.acquire(fingerprint, 'other-operation', Date.now(), Date.now() + 60000);
    await expect(service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal)).rejects.toThrow('active');
    expect(jest.mocked(managedSsh)).not.toHaveBeenCalled();
  });

  it('keeps pending changes exclusive after interruption, including a new commissioning session with only the pinned fingerprint', async () => {
    failure = 'apply';
    await expect(service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal)).rejects.toThrow('incomplete');
    await expect(managed.assertNetworkSettled(1)).rejects.toThrow('pending MQTT/address change');
    await expect(managed.assertNetworkSettled(null, fingerprint)).rejects.toThrow('pending MQTT/address change');
    await expect(managed.assertNetworkSettled(null, `SHA256:${'b'.repeat(43)}`)).resolves.toBeUndefined();
    await expect(managed.assertNetworkSettled(null)).resolves.toBeUndefined();
  });

  it('rejects stale or wrong-broker evidence and does not commit before the authenticated device acknowledgement', async () => {
    allowEvidence = false;
    const result = service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal);
    for (let i = 0; i < 50 && payloads.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    const payload = JSON.parse(payloads[0].toString()),
      topic = `${payload.prefix}/v1/controllers/${payload.hardwareId}/credentials/rotate/ack`;
    const ack = { revision: 1, token: payload.token, credentialEpoch: payload.credentialEpoch, status: 'reconnected' };
    listener({ serverId: 1, topic, payload: Buffer.from(JSON.stringify(ack)) });
    listener({ serverId: 2, topic, payload: Buffer.from(JSON.stringify({ ...ack, token: 'old-token' })) });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await service.status(1)).toMatchObject({ mqttServerId: 1, targetHost: oldHost });
    listener({ serverId: 2, topic, payload: Buffer.from(JSON.stringify(ack)) });
    expect(await result).toMatchObject({ mqttServerId: 2, operation: { phase: 'completed' } });
  });

  it('keeps previous broker cleanup retryable and does not hide the successful migration', async () => {
    await service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal);
    await expect(service.retirePreviousCredentials(1, principal)).rejects.toThrow('could not be retired');
    expect(await service.status(1)).toMatchObject({
      operation: { phase: 'completed' },
      pendingCredentialRetirements: 1,
    });
    revoke.mockResolvedValue(undefined);
    expect(await service.retirePreviousCredentials(1, principal)).toMatchObject({ pendingCredentialRetirements: 0 });
  });

  it('clears redundant broker aliases without revoking the active credentials', async () => {
    await service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal);
    jest.mocked(lookup).mockResolvedValue([{ address: '192.168.4.10', family: 4 }] as never);
    await db.getRepository(WagoManagedAccess).update(1, { state: 'retired' });
    expect(await service.retirePreviousCredentials(1, principal)).toMatchObject({ pendingCredentialRetirements: 0 });
    expect(revoke).not.toHaveBeenCalled();
    await expect(managed.assertRemovable(1)).resolves.toBeUndefined();
  });

  it('clears duplicate broker hostnames without requiring DNS or revoking credentials', async () => {
    brokerHost = 'unreachable-old.test';
    await service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal);
    jest.mocked(lookup).mockRejectedValue(new Error('DNS unavailable'));
    expect(await service.retirePreviousCredentials(1, principal)).toMatchObject({ pendingCredentialRetirements: 0 });
    expect(revoke).not.toHaveBeenCalled();
  });

  it('retains ambiguous shared-host retirements for different broker listeners', async () => {
    await service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal);
    jest.mocked(lookup).mockResolvedValue([{ address: '192.168.4.10', family: 4 }] as never);
    jest.mocked(context.getMqttServerConfig).mockImplementation(async (id) => ({
      id,
      host: 'shared.test',
      name: 'Shared host',
      username: null,
      password: null,
      clientId: null,
      port: id === 1 ? 1883 : 1884,
      useTls: false,
    }));
    await expect(service.retirePreviousCredentials(1, principal)).rejects.toThrow('could not be retired');
    expect(revoke).not.toHaveBeenCalled();
    expect((await service.status(1)).pendingCredentialRetirements).toBe(1);
  });

  it('keeps old-credential retirement available after SSH management has been retired', async () => {
    await service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal);
    await db.getRepository(WagoManagedAccess).update(1, { state: 'retired' });
    revoke.mockResolvedValue(undefined);
    expect(await service.retirePreviousCredentials(1, principal)).toMatchObject({
      available: false,
      pendingCredentialRetirements: 0,
    });
  });
});

it.each(['192.168.1.10;reboot', '127.0.0.1', '8.8.8.8', '10.0.0.999', '10.0.00.1', '-oProxyCommand=sh'])(
  'rejects unsafe SSH target %s',
  (targetHost) => {
    expect(() => networkChangeInput({ targetHost, mqttServerId: 1 })).toThrow();
  },
);

it('migrates recovery storage and refuses to discard pending device changes or previous broker identities', async () => {
  const db = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
  const runner = db.createQueryRunner(),
    migration = new WagoNetworkChanges1780010660000();
  try {
    await runner.query('CREATE TABLE plugin_wago_controllers (id integer PRIMARY KEY)');
    await runner.query('INSERT INTO plugin_wago_controllers VALUES (1)');
    await migration.up(runner);
    await runner.query(
      `INSERT INTO plugin_wago_network_changes
      (controller_id, session_id, fingerprint, target_host, mqtt_server_id, phase, encrypted_payload, updated_at)
      VALUES (1, 1, ?, ?, 2, 'applying', 'encrypted-intent', ?)`,
      [fingerprint, newHost, new Date().toISOString()],
    );
    await expect(migration.down(runner)).rejects.toThrow('Finish controller network changes');
    await runner.query("UPDATE plugin_wago_network_changes SET phase = 'completed'");
    await runner.query('INSERT INTO plugin_wago_mqtt_credential_retirements VALUES (1, 1)');
    await expect(migration.down(runner)).rejects.toThrow('Retire old broker credentials');
    await runner.query('DELETE FROM plugin_wago_controllers WHERE id = 1');
    expect(await runner.query('SELECT * FROM plugin_wago_network_changes')).toEqual([]);
    expect(await runner.query('SELECT * FROM plugin_wago_mqtt_credential_retirements')).toEqual([]);
    await migration.down(runner);
  } finally {
    await runner.release();
    await db.destroy();
  }
});
