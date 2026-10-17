import { PluginContext } from '@attraccess/plugins-backend-sdk';
import { DataSource } from 'typeorm';
import { BuildRuntimeArtifact } from '../artifacts/build';
import { WagoCommissioningReadiness } from '../../commissioning/readiness/readiness';
import { WagoCommissioningSession } from '../../commissioning/sessions/session.entity';
import { commissioningVerification } from '../../commissioning/sessions/verification';
import { WagoController } from '../../controllers/entity';
import { WagoDeviceOperations } from '../device-operations';
import { WagoDeviceOperation, WagoManagedAccess } from './access.entity';
import { WagoManagedRuntimeService } from './service';
import { resetTestFixture } from './setup.test-fixture';
import { managedSsh } from './transport/ssh';
import { WagoRuntimeArtifactsService } from '../artifacts/catalog';
import { WagoService } from '../../controllers/service';

const artifact: BuildRuntimeArtifact = {
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
    image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'2'.repeat(64)}`,
    hardware: {
      model: '751-9301',
      platform: 'linux/arm/v7',
      firmwareBaseline: '31',
      profile: 'cc100-751-9301-fw31-digital-v1',
    },
  },
};

const principal = { userId: 7, authenticationMethod: 'session' as const };

jest.mock('@attraccess/plugins-backend-sdk', () => jest.requireActual('typeorm'));

jest.mock('../../controllers/service', () => ({ WagoService: class {} }));

jest.mock('../artifacts/catalog', () => ({ WagoRuntimeArtifactsService: class {} }));

jest.mock('../../commissioning/readiness/readiness', () => ({ WagoCommissioningReadiness: class {} }));

jest.mock('./transport/ssh', () => ({ ...jest.requireActual('./transport/ssh'), managedSsh: jest.fn() }));

jest.mock('../../commissioning/sessions/verification', () => ({ commissioningVerification: jest.fn() }));

describe('managed enrolment and durable credential lifecycle', () => {
  let db: DataSource;

  let service: WagoManagedRuntimeService;

  let encrypt: jest.Mock;

  let decrypt: jest.Mock;

  let audit: jest.Mock;

  let rootProbe: jest.Mock;

  let context: PluginContext;

  const session = (id = 1) =>
    Object.assign(new WagoCommissioningSession(), {
      id,
      targetHost: '10.77.0.7',
      hostKeyFingerprint: `SHA256:${'a'.repeat(43)}`,
      hardwareId: `cc100-${id}`,
    });

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    await new Promise(setImmediate);
    await db.destroy();
    jest.clearAllMocks();
  });

  const scope = {
    get context() {
      return context;
    },
    set context(value: typeof context) {
      context = value;
    },
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get artifact() {
      return artifact;
    },
    get db() {
      return db;
    },
    set db(value: typeof db) {
      db = value;
    },
    get decrypt() {
      return decrypt;
    },
    set decrypt(value: typeof decrypt) {
      decrypt = value;
    },
    get session() {
      return session;
    },
    get rootProbe() {
      return rootProbe;
    },
    set rootProbe(value: typeof rootProbe) {
      rootProbe = value;
    },
    get principal() {
      return principal;
    },
    get encrypt() {
      return encrypt;
    },
    set encrypt(value: typeof encrypt) {
      encrypt = value;
    },
    get audit() {
      return audit;
    },
    set audit(value: typeof audit) {
      audit = value;
    },
  };

  it('starts background reconciliation on bootstrap without additional configuration', async () => {
    const restarted = new WagoManagedRuntimeService(
      context,
      { registerRuntimeStatusHandler: jest.fn() } as unknown as WagoService,
      {} as WagoRuntimeArtifactsService,
      {} as WagoCommissioningReadiness,
    );
    const scan = jest.spyOn(restarted as unknown as { scan(): Promise<void> }, 'scan').mockResolvedValue(undefined);
    try {
      restarted.onApplicationBootstrap();
      await new Promise(setImmediate);
      expect(scan).toHaveBeenCalledTimes(1);
    } finally {
      await restarted.onModuleDestroy();
    }
  });

  it('coalesces repeated heartbeat wakes into one bounded fleet scan window', async () => {
    const internals = service as unknown as {
      scan(): Promise<void>;
      wake(): void;
      nextScanAt: number;
      scanning: boolean;
    };
    const deadline = Date.now() + 5000;
    while (internals.scanning && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(internals.scanning).toBe(false);
    const scan = jest.spyOn(internals, 'scan').mockResolvedValue(undefined);
    internals.nextScanAt = 0;
    internals.wake();
    await new Promise(setImmediate);
    for (let count = 0; count < 50; count++) internals.wake();
    await new Promise(setImmediate);
    expect(scan).toHaveBeenCalledTimes(1);
    internals.nextScanAt = 0;
    internals.wake();
    await new Promise(setImmediate);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('processes a new connection immediately inside the fleet scan cooldown', async () => {
    const internals = service as unknown as {
      nextScanAt: number;
      scanning: boolean;
      reconcileConnection(id: number): Promise<void>;
    };
    while (internals.scanning) await new Promise(setImmediate);
    internals.nextScanAt = Date.now() + 30_000;
    const reconcile = jest.spyOn(internals, 'reconcileConnection').mockResolvedValue(undefined);
    const handler = jest.mocked(service['wago'].registerRuntimeStatusHandler).mock.calls[0][0];
    handler(1, {
      imageId: artifact.imageId,
      streamId: '00000000-0000-4000-8000-000000000001',
      sequence: 1,
      timestamp: Date.now(),
      receivedAt: Date.now(),
    });
    await new Promise(setImmediate);
    expect(reconcile).toHaveBeenCalledWith(1);
  });

  it('confirms the installed image policy for a rebuilt release of the same version', async () => {
    const imageId = `sha256:${'0'.repeat(64)}`;
    const timestamp = new Date().toISOString();
    await db.getRepository(WagoController).save(
      Object.assign(new WagoController(), {
        id: 1,
        hardwareId: 'cc100-1',
        trustState: 'claimed',
        pairingCodeHash: 'fixture',
        protocolVersion: '1.0.0',
        runtimeVersion: artifact.manifest.runtimeVersion,
        capabilities: '[]',
        lastSeenAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    service['heartbeats'].set(1, {
      imageId,
      runtimeVersion: artifact.manifest.runtimeVersion,
      streamId: '00000000-0000-4000-8000-000000000001',
      timestamp: Date.now(),
      receivedAt: Date.now(),
    });
    const policy = jest.fn();
    service['wago'].setRuntimePolicy = policy;
    await service['refreshRuntimePolicy'](1);
    expect(policy).toHaveBeenCalledWith(1, imageId, imageId, undefined);
    expect(await service.status(1)).toMatchObject({
      runtime: {
        runningImageId: imageId,
        desiredImageId: imageId,
        runningVersion: artifact.manifest.runtimeVersion,
        desiredVersion: artifact.manifest.runtimeVersion,
      },
    });
  });

  it('persists authenticated ciphertext before remote mutation and rotates per enrolment', async () => {
    const execute = jest.fn(async (_script: string) => {
      const rows = await db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access');
      expect(rows[0].encrypted_credentials).not.toContain('PRIVATE KEY');
      expect(JSON.parse(decrypt(rows[0].encrypted_credentials))).toMatchObject({ sessionId: 1 });
      return 'OK\n';
    });
    await service.enrol(session(), execute, new AbortController().signal);
    await service.enrol(session(2), async () => 'OK\n', new AbortController().signal);
    const rows = await db.query(
      'SELECT encrypted_credentials, key_fingerprint FROM plugin_wago_managed_access ORDER BY session_id',
    );
    const first = JSON.parse(decrypt(rows[0].encrypted_credentials)),
      second = JSON.parse(decrypt(rows[1].encrypted_credentials));
    expect(first.privateKey).not.toEqual(second.privateKey);
    expect(first.recoveryPassword).not.toEqual(second.recoveryPassword);
    expect(rootProbe).toHaveBeenCalledWith(session().targetHost, session().hostKeyFingerprint, first.recoveryPassword);
    expect(await db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).not.toHaveProperty(
      'encryptedCredentials',
    );
    expect(await service.recoverPassword(1, principal)).toEqual({ password: first.recoveryPassword });
    expect(await service.status(100)).toEqual({
      sessionId: null,
      management: 'reenrol_required',
      keyFingerprint: null,
      update: null,
      physicalQualification: 'unverified',
    });
  });

  it('does not mutate remotely when encryption fails or returns plaintext', async () => {
    encrypt.mockImplementation((plaintext) => plaintext);
    const execute = jest.fn();
    await expect(service.enrol(session(), execute, new AbortController().signal)).rejects.toThrow('encryption');
    expect(execute).not.toHaveBeenCalled();
    expect(await db.getRepository(WagoManagedAccess).count()).toBe(0);
  });

  it('verifies the encrypted database round trip and fails before remote changes when storage is corrupt', async () => {
    const repository = db.getRepository(WagoManagedAccess);
    const save = repository.save.bind(repository);
    jest.spyOn(repository, 'save').mockImplementationOnce(async (value) => {
      const row = await save(value);
      await repository.update(1, { encryptedCredentials: 'corrupted-ciphertext' });
      return row;
    });
    const execute = jest.fn();
    await expect(service.enrol(session(), execute, new AbortController().signal)).rejects.toThrow('unavailable');
    expect(execute).not.toHaveBeenCalled();
    expect(managedSsh).not.toHaveBeenCalled();
  });

  it('retains the pending identity after lost key cleanup and retries without generating replacement secrets', async () => {
    jest.mocked(managedSsh).mockImplementation(async (_access, _key, header) => {
      if (header.startsWith('access-key-commit')) {
        expect(await db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).toMatchObject({
          state: 'verified',
        });
        throw new Error('lost receipt');
      }
      return `OK ${header.split(' ')[1]}\n`;
    });
    await expect(service.enrol(session(), async () => 'OK\n', new AbortController().signal)).rejects.toThrow(
      'Managed SSH setup failed (commit)',
    );
    const before = (await db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access'))[0]
      .encrypted_credentials;
    jest
      .mocked(managedSsh)
      .mockImplementation(async (_access, _key, header) =>
        header.startsWith('proof ') ? `OK ${header.split(' ')[1]}\n` : 'OK\n',
      );
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    expect(
      (await db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access'))[0].encrypted_credentials,
    ).toBe(before);
  });

  it('retains recovery intent on failed second key connection without disabling SSH policy', async () => {
    jest.mocked(managedSsh).mockRejectedValue(new Error('transport output with fixture secret'));
    const execute = jest.fn(async (_script: string) => 'OK\n');
    await expect(service.enrol(session(), execute, new AbortController().signal)).rejects.toThrow(
      'Managed SSH setup failed (proof)',
    );
    expect(await db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).toMatchObject({
      state: 'recovery_required',
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).not.toContain('dropbear restart');
    expect(rootProbe).not.toHaveBeenCalled();
  });

  it('requires a recorded administrator audit before decrypting/disclosing root recovery', async () => {
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    decrypt.mockClear();
    audit.mockResolvedValue({ status: 'unavailable' });
    await expect(service.recoverPassword(1, principal)).rejects.toThrow('Durable audit');
    expect(decrypt).not.toHaveBeenCalled();
    expect(JSON.stringify(audit.mock.calls)).not.toContain('PRIVATE KEY');
    audit.mockResolvedValue({ status: 'recorded' });
    const result = await service.recoverPassword(1, principal);
    expect(result).toEqual({ password: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    expect(result).not.toHaveProperty('privateKey');
  });

  it('selects encrypted recovery access only after proving the pinned root login', async () => {
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    const row = (await db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access'))[0];
    const credentials = JSON.parse(decrypt(row.encrypted_credentials));
    expect(await service.commissioningRecoveryPassword(session())).toBe(credentials.recoveryPassword);
    rootProbe.mockResolvedValue(false);
    expect(await service.commissioningRecoveryPassword(session())).toBeNull();
    expect(await service.sessionStatus(1)).not.toHaveProperty('password');
    await expect(
      service.commissioningRecoveryPassword(Object.assign(session(), { targetHost: '10.77.0.8' })),
    ).rejects.toThrow('identity changed');
  });

  it('rejects encrypted envelopes copied to another controller/session', async () => {
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    await db.getRepository(WagoManagedAccess).update(1, { fingerprint: `SHA256:${'b'.repeat(43)}` });
    await expect(service.recoverPassword(1, principal)).rejects.toThrow('does not match');
  });

  it('visibly blocks unreadable managed credentials without exposing the envelope', async () => {
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    await db.getRepository(WagoManagedAccess).update(1, {
      controllerId: 1,
      state: 'managed',
      encryptedCredentials: 'corrupt-secret-envelope',
    });
    const status = await service.status(1);
    expect(status.management).toBe('recovery_required');
    expect(JSON.stringify(status)).not.toContain('corrupt-secret-envelope');
    await expect(service.assertRemovable(1)).rejects.toThrow('retire managed');
  });

  it('retains retirement intent and recovery secrets until remote key removal is independently verified', async () => {
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    await db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'managed' });
    await expect(service.assertRemovable(1)).rejects.toThrow('retire managed');
    const probe = jest.fn(async () => false);
    service.registerRetirementProbe(probe);
    await expect(service.restoreAccess(1, principal)).rejects.toThrow('retirement is unverified');
    expect((await service.sessionStatus(1)).management).toBe('retiring');
    await expect(service.retryAccess(1)).rejects.toThrow('cannot be retried');
    // A restarted request can observe the removal, even after losing its SSH reply.
    probe.mockResolvedValue(true);
    await service.restoreAccess(1, principal);
    expect((await service.sessionStatus(1)).management).toBe('retired');
    await expect(service.assertRemovable(1)).resolves.toBeUndefined();
    expect(await service.recoverPassword(1, principal)).toEqual({ password: expect.any(String) });
  });

  it('shares device ownership across processes and fences expired owners without releasing a successor', async () => {
    const first = new WagoDeviceOperations(db.getRepository(WagoDeviceOperation));
    const second = new WagoDeviceOperations(db.getRepository(WagoDeviceOperation));
    expect(await first.acquire('device-a', 'commissioning', 100, 200)).toBe(true);
    expect(await second.acquire('device-a', 'update', 150, 300)).toBe(false);
    expect(await second.acquire('device-b', 'update-b', 150, 300)).toBe(true);
    await expect(first.assertOwned('device-a', 'commissioning', 201)).rejects.toThrow('ownership');
    expect(await second.acquire('device-a', 'successor', 201, 400)).toBe(true);
    await first.release('device-a', 'commissioning');
    expect(await first.acquire('device-a', 'third', 202, 500)).toBe(false);
  });

  it('does not resurrect retirement recorded while managed-access retry acquires its lease', async () => {
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    const operations = service['operations'];
    const acquire = operations.acquire.bind(operations);
    jest.spyOn(operations, 'acquire').mockImplementation(async (...args) => {
      await db.getRepository(WagoManagedAccess).update(1, { state: 'retiring' });
      return acquire(...args);
    });
    jest.mocked(managedSsh).mockClear();
    await expect(service.retryAccess(1)).rejects.toThrow('cannot be retried');
    expect(jest.mocked(managedSsh)).not.toHaveBeenCalled();
    expect((await service.sessionStatus(1)).management).toBe('retiring');
    expect(
      await db.getRepository(WagoDeviceOperation).findOneBy({ fingerprint: session().hostKeyFingerprint }),
    ).toMatchObject({ owner: null });
  });

  it('fences runtime retries when retirement wins ownership and retains pending recovery metadata', async () => {
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    await db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'managed' });
    const operations = service['operations'];
    const acquire = operations.acquire.bind(operations);
    jest.spyOn(operations, 'acquire').mockImplementation(async (...args) => {
      await db.getRepository(WagoManagedAccess).update(1, { state: 'retiring' });
      return acquire(...args);
    });
    jest.mocked(managedSsh).mockClear();
    await expect(service.retryRuntime(1)).rejects.toThrow('management_required');
    expect(jest.mocked(managedSsh)).not.toHaveBeenCalled();
    expect((await service.sessionStatus(1)).management).toBe('retiring');
    expect(
      await db.getRepository(WagoDeviceOperation).findOneBy({ fingerprint: session().hostKeyFingerprint }),
    ).toMatchObject({ owner: null });
  });

  it.each(['connection', 'runtime_state', 'enrollment_credentials', 'configuration', 'readiness'] as const)(
    'explains the %s prerequisite holding up automatic SSH completion without touching SSH',
    async (reason) => {
      const now = new Date().toISOString();
      const current = await db.getRepository(WagoController).save(
        Object.assign(new WagoController(), {
          id: 1,
          hardwareId: 'cc100-1',
          trustState: 'claimed',
          mqttServerId: 7,
          pairingCodeHash: 'fixture',
          protocolVersion: '1',
          runtimeVersion: '1',
          capabilities: '[]',
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        }),
      );
      await db.getRepository(WagoCommissioningSession).save(
        Object.assign(session(), {
          mqttServerId: 7,
          firmwareBaseline: '31',
          state: 'awaiting_verification',
          initiatingPrincipal: JSON.stringify(principal),
          auditLog: '[]',
          createdAt: now,
          updatedAt: now,
        }),
      );
      await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
      await db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'verified' });
      if (reason !== 'connection')
        service['heartbeats'].set(1, {
          imageId: artifact.imageId,
          streamId: 'boot-new',
          timestamp: Date.now(),
          receivedAt: Date.now(),
        });
      service['readiness'].observe = jest.fn(() =>
        reason === 'runtime_state'
          ? undefined
          : {
              timestamp: Date.now(),
              streamId: 'boot-new',
              sequence: 1,
              revision: 1,
              contentHash: 'a'.repeat(64),
              connected: true,
              configurationAccepted: reason !== 'configuration',
              hardwareAvailable: reason !== 'readiness',
              ready: reason !== 'configuration' && reason !== 'readiness',
            },
      );
      jest.mocked(commissioningVerification).mockResolvedValue({
        controllerId: 1,
        permanentConnection: true,
        enrollmentRevoked: reason !== 'enrollment_credentials',
        configurationApplied: reason !== 'configuration',
        hardwareReadiness: reason === 'readiness' ? 'not_ready' : 'ready',
        managementHardening: 'unverified',
        physicalQualification: 'required',
        ready: false,
      });
      jest.mocked(managedSsh).mockClear();
      expect(await service['completeEnrolment'](current)).toBe(false);
      expect(await service.status(1)).toMatchObject({
        management: 'verified',
        managementSetup: { state: 'waiting', reason },
      });
      expect(jest.mocked(managedSsh)).not.toHaveBeenCalled();
    },
  );
});
