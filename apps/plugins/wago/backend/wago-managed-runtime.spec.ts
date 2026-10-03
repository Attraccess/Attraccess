import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DataSource } from 'typeorm';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { commissioningAcceptanceScript } from './wago-commissioning-accept';
import { RuntimeUpdateError } from './wago-runtime-update';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoNetworkChange, WagoMqttCredentialRetirement } from './wago-network-change.entity';
import { WagoDeviceOperations } from './wago-device-operations';
import { WagoManagedUpdates1780010650000 } from './migrations/1780010650000-add-wago-managed-updates';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoService } from './wago.service';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { managedSsh, managedSshFailure } from './wago-managed-ssh';
import { commissioningVerification } from './wago-commissioning-verification';
import { managedHostHelper } from './wago-managed-helper';
import {
  managedProvisionScript,
  managedCutoverScript,
  managedCommitScript,
  managedAccessWatchdog,
  managedWatchdogScript,
} from './wago-managed-provision';
import type { BuildRuntimeArtifact } from './wago-build-runtime';
import { generateManagementKey } from './wago-management-key';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { WAGO_DIN, WAGO_DOUT } from './wago-hardware-deployment';
import { runtimeBundleDeliveryScript } from './wago-runtime-install';
import { signInstaller, MANAGED_HELPER_PROTOCOL } from './wago-managed-installer';

jest.mock('@attraccess/plugins-backend-sdk', () => jest.requireActual('typeorm'));
jest.mock('./wago.service', () => ({ WagoService: class {} }));
jest.mock('./wago-runtime-artifacts', () => ({ WagoRuntimeArtifactsService: class {} }));
jest.mock('./wago-commissioning-readiness', () => ({ WagoCommissioningReadiness: class {} }));
jest.mock('./wago-managed-ssh', () => ({ ...jest.requireActual('./wago-managed-ssh'), managedSsh: jest.fn() }));
jest.mock('./wago-commissioning-verification', () => ({ commissioningVerification: jest.fn() }));

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
    db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [
        WagoManagedAccess,
        WagoNetworkChange,
        WagoMqttCredentialRetirement,
        WagoRuntimeUpdateEntity,
        WagoDeviceOperation,
        WagoController,
        WagoCommissioningSession,
      ],
      synchronize: true,
    }).initialize();
    const key = randomBytes(32);
    encrypt = jest.fn((plaintext: string) => {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([iv, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]).toString('base64');
    });
    decrypt = jest.fn((envelope: string) => {
      const bytes = Buffer.from(envelope, 'base64'),
        cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString();
    });
    audit = jest.fn(async () => ({ status: 'recorded' }));
    context = {
      getRepository: (entity: never) => db.getRepository(entity),
      secrets: { encrypt, decrypt },
      audit: { record: audit },
      logger: { warn: jest.fn() },
    } as unknown as PluginContext;
    service = new WagoManagedRuntimeService(
      context,
      {
        registerRuntimeStatusHandler: jest.fn(),
        getSettings: async () => ({ operationalPrefix: 'attraccess/wago' }),
      } as unknown as WagoService,
      { current: async () => artifact } as WagoRuntimeArtifactsService,
      {} as unknown as WagoCommissioningReadiness,
    );
    service.onApplicationBootstrap();
    rootProbe = jest.fn(async () => true);
    service.registerRootProbe(rootProbe);
    jest
      .mocked(managedSsh)
      .mockImplementation(async (_access, _key, header) =>
        header.startsWith('proof ') ? `OK ${header.split(' ')[1]}\n` : 'OK\n',
      );
  });
  afterEach(async () => {
    await service.onModuleDestroy();
    await new Promise(setImmediate);
    await db.destroy();
    jest.clearAllMocks();
  });

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

  it.each(['committed', 'open', 'retiring', 'slow-preparation', 'slow-cutover', 'acceptance-failed', 'slow-policy', 'bootstrap-acceptance', 'stuck-cutover'] as const)(
    'reconciles %s cutover with reboot proof before a new commit',
    async (remoteStatus) => {
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
          lastSeenAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );
      await db.getRepository(WagoCommissioningSession).save(
        Object.assign(session(), {
          mqttServerId: 7,
          firmwareBaseline: '31',
          state: 'awaiting_verification',
          initiatingPrincipal: JSON.stringify(principal),
          deliveryToken: 'a'.repeat(32),
          dockerProvisionToken: 'a'.repeat(32),
          auditLog: '[]',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );
      await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
      await db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'recovery_required' });
      const now = Date.now();
      service['heartbeats'].set(1, {
        imageId: artifact.imageId,
        streamId: 'boot-new',
        timestamp: now,
        receivedAt: now,
      });
      service['readiness'].observe = jest.fn(() => ({
        timestamp: now,
        streamId: 'boot-new',
        sequence: 1,
        revision: 1,
        contentHash: 'a'.repeat(64),
        connected: true,
        configurationAccepted: true,
        hardwareAvailable: true,
        ready: true,
      }));
      jest.mocked(commissioningVerification).mockResolvedValue({
        controllerId: 1,
        permanentConnection: true,
        enrollmentRevoked: true,
        configurationApplied: true,
        hardwareReadiness: 'ready',
        managementHardening: 'unverified',
        physicalQualification: 'required',
        ready: false,
      });
      if (remoteStatus === 'retiring') {
        const operations = service['operations'];
        const acquire = operations.acquire.bind(operations);
        jest.spyOn(operations, 'acquire').mockImplementation(async (...args) => {
          await db.getRepository(WagoManagedAccess).update(1, { state: 'retiring' });
          return acquire(...args);
        });
        jest.mocked(managedSsh).mockClear();
        expect(await service['completeEnrolment'](current)).toBe(false);
        expect(jest.mocked(managedSsh)).not.toHaveBeenCalled();
        expect((await service.sessionStatus(1)).management).toBe('retiring');
        return;
      }
      const open = remoteStatus === 'open' || remoteStatus === 'slow-preparation' || remoteStatus === 'slow-cutover' || remoteStatus === 'acceptance-failed' || remoteStatus === 'slow-policy' || remoteStatus === 'bootstrap-acceptance';
      rootProbe.mockResolvedValue(open);
      const bootstrapAcceptance = jest.fn(async (_host, _fingerprint, _password, _token, guard) => {
        await guard.assertOwned();
        expect(guard.signal.aborted).toBe(false);
      });
      if (remoteStatus === 'bootstrap-acceptance') service.registerPreparationAcceptance(bootstrapAcceptance);
      let preparationStarted!: () => void;
      let cutoverStarted!: () => void;
      let rebootStarted!: () => void;
      let policyStarted!: () => void;
      const preparing = new Promise<void>((resolve) => { preparationStarted = resolve; });
      const cuttingOver = new Promise<void>((resolve) => { cutoverStarted = resolve; });
      const rebooting = new Promise<void>((resolve) => { rebootStarted = resolve; });
      const checkingPolicy = new Promise<void>((resolve) => { policyStarted = resolve; });
      let slowStepAborted = false;
      let boot = '00000000-0000-4000-8000-000000000001\n';
      jest.mocked(managedSsh).mockImplementation(async (_access, _key, header, signal) => {
        if (header.startsWith('access-status ')) return (open ? 'open' : remoteStatus === 'stuck-cutover' ? 'cutover' : remoteStatus) + '\n';
        if (remoteStatus === 'stuck-cutover' && header.startsWith('access-restore '))
          throw new RuntimeUpdateError('lock_tools');
        if (remoteStatus === 'slow-preparation' && header.startsWith('access-key-commit ')) {
          preparationStarted();
          await new Promise((resolve) => setTimeout(resolve, 200_000));
          slowStepAborted = signal.aborted;
          signal.throwIfAborted();
        }
        if (remoteStatus === 'slow-policy' && header.startsWith('access-policy ')) {
          policyStarted();
          await new Promise((resolve) => setTimeout(resolve, 200_000));
          signal.throwIfAborted();
        }
        if (remoteStatus === 'acceptance-failed' && header.startsWith('commissioning-accept '))
          throw new Error('internal detail with a secret must not be persisted');
        if (header.startsWith('access-cutover ')) {
          expect(await service.status(1)).toMatchObject({
            managementSetup: { state: 'running', reason: 'ssh_cutover' },
          });
          rootProbe.mockResolvedValue(false);
          cutoverStarted();
          if (remoteStatus === 'slow-cutover') {
            await new Promise((resolve) => setTimeout(resolve, 200_000));
            slowStepAborted = signal.aborted;
            signal.throwIfAborted();
          }
        }
        if (header.startsWith('access-boot ')) return boot;
        if (header.startsWith('access-reboot ')) {
          expect(await service.status(1)).toMatchObject({ managementSetup: { state: 'running', reason: 'reboot' } });
          boot = '00000000-0000-4000-8000-000000000002\n';
          rebootStarted();
        }
        return header.startsWith('proof ') ? `OK ${header.split(' ')[1]}\n` : 'OK\n';
      });
      if (remoteStatus === 'stuck-cutover') {
        expect(await service['completeEnrolment'](current)).toBe(false);
        expect(await service.status(1)).toMatchObject({
          management: 'recovery_required',
          managementFailure: expect.stringContaining('Automatic SSH setup failed (rollback).'),
        });
        expect((await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).failureReason).toContain('lock option unsupported');
        expect(jest.mocked(managedSsh).mock.calls.some(call => call[2].startsWith('access-commit '))).toBe(false);
        return;
      }
      if (remoteStatus === 'acceptance-failed') {
        expect(await service['completeEnrolment'](current)).toBe(false);
        const failure = (await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).failureReason;
        expect(failure).toContain('Automatic SSH setup failed (acceptance).');
        expect(failure).toContain('retained transaction records');
        expect(failure).not.toContain('secret');
        expect(await service.status(1)).toMatchObject({ management: 'recovery_required', managementFailure: failure });
        expect(jest.mocked(managedSsh).mock.calls.some((call) => call[2].startsWith('access-cutover '))).toBe(false);
        // A transient offline status probe on the next scan must not replace
        // the useful failure from the last audited setup attempt.
        jest.mocked(managedSsh).mockRejectedValue(new RuntimeUpdateError('offline'));
        expect(await service['completeEnrolment'](current)).toBe(false);
        expect((await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).failureReason).toBe(failure);
        jest.mocked(managedSsh).mockRejectedValue(new RuntimeUpdateError('host_identity'));
        expect(await service['completeEnrolment'](current)).toBe(false);
        expect((await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).failureReason).toContain('SSH host key differs');
        return;
      }
      if (remoteStatus === 'slow-policy') {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        try {
          const completion = service['completeEnrolment'](current);
          await cuttingOver;
          await jest.advanceTimersByTimeAsync(3000);
          await checkingPolicy;
          await jest.advanceTimersByTimeAsync(200_000);
          expect(await completion).toBe(false);
          expect(await service.status(1)).toMatchObject({
            management: 'recovery_required',
            managementFailure: expect.stringContaining('Automatic SSH setup failed (policy).'),
          });
          expect(jest.mocked(managedSsh).mock.calls.some((call) => call[2].startsWith('access-commit '))).toBe(false);
        } finally {
          jest.useRealTimers();
        }
        return;
      }
      if (remoteStatus === 'slow-preparation' || remoteStatus === 'slow-cutover') {
        // A legitimate supervisor gate can hold install.lock for up to 300s.
        // Waiting for it must not consume the later SSH rollback window.
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        try {
          const completion = service['completeEnrolment'](current);
          await (remoteStatus === 'slow-preparation' ? preparing : cuttingOver);
          await jest.advanceTimersByTimeAsync(200_000);
          if (slowStepAborted) {
            expect(await completion).toBe(true);
            return;
          }
          await cuttingOver;
          await jest.advanceTimersByTimeAsync(3000);
          await rebooting;
          await jest.advanceTimersByTimeAsync(1000);
          expect(await completion).toBe(true);
        } finally {
          jest.useRealTimers();
        }
      } else expect(await service['completeEnrolment'](current)).toBe(true);
      if (remoteStatus === 'bootstrap-acceptance') {
        expect(bootstrapAcceptance).toHaveBeenCalledTimes(1);
        expect(bootstrapAcceptance.mock.calls[0].slice(0, 2)).toEqual([session().targetHost, session().hostKeyFingerprint]);
        expect(bootstrapAcceptance.mock.calls[0][3]).toBe('a'.repeat(32));
        expect(jest.mocked(managedSsh).mock.calls.some((call) => call[2].startsWith('commissioning-accept '))).toBe(false);
      }
      expect(await service.status(1)).not.toHaveProperty('managementSetup');
      expect(await db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).toMatchObject({
        state: 'managed',
      });
      expect(await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).toMatchObject({
        state: 'completed',
        deliveryToken: null,
      });
      const commands = jest.mocked(managedSsh).mock.calls.map((call) => call[2].split(' ')[0]);
      if (remoteStatus === 'committed') expect(commands).not.toContain('access-cutover');
      else {
        expect(commands.indexOf('access-reboot')).toBeLessThan(commands.indexOf('access-commit'));
        expect(commands.filter((command) => command === 'access-boot')).toHaveLength(2);
      }
      const securityEvents = audit.mock.calls
        .map((call) => call[0])
        .filter((event) => event.action === 'wago.commissioning.security_apply');
      expect(securityEvents.map((event) => event.outcome)).toEqual(['attempted', 'succeeded']);
      expect(securityEvents[0].operationId).toBe(securityEvents[1].operationId);
    },
    15_000,
  );

  it('uses the bound identity after restart despite a newer unused session, publishing installer changes and updating with only the stored key', async () => {
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
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
    for (const [id, state] of [
      [1, 'completed'],
      [2, 'awaiting_confirmation'],
    ] as const)
      await db.getRepository(WagoCommissioningSession).save(
        Object.assign(session(id), {
          hardwareId: current.hardwareId,
          mqttServerId: 7,
          firmwareBaseline: '31',
          state,
          initiatingPrincipal: JSON.stringify(principal),
          auditLog: '[]',
          createdAt: now,
          updatedAt: now,
        }),
      );
    await db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'managed' });
    const envelope = (
      await db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access WHERE session_id = 1')
    )[0].encrypted_credentials;
    const credentials = JSON.parse(decrypt(envelope));
    await service.onModuleDestroy();
    let heartbeat: Parameters<WagoService['registerRuntimeStatusHandler']>[0] = () => undefined;
    let boot = '00000000-0000-4000-8000-000000000001';
    let sequence = 1;
    let policyConfirmed = false;
    const restarted = new WagoManagedRuntimeService(
      service['context'],
      {
        registerRuntimeStatusHandler: (handler) => {
          heartbeat = handler;
        },
        setRuntimePolicy: async (_id: number, desired: string, observed: string) => {
          policyConfirmed = desired === observed;
        },
        getSettings: async () => ({ operationalPrefix: 'attraccess/wago' }),
      } as WagoService,
      {
        current: async () => artifact,
        acquire: async () => ({ path: '/mock/build-owned-bundle', cleanup: jest.fn() }),
      } as unknown as WagoRuntimeArtifactsService,
      {
        observe: () => ({
          timestamp: Date.now(),
          streamId: boot,
          sequence,
          revision: 1,
          contentHash: 'a'.repeat(64),
          connected: true,
          configurationAccepted: true,
          hardwareAvailable: true,
          ready: policyConfirmed,
        }),
      } as unknown as WagoCommissioningReadiness,
    );
    let installed = '0'.repeat(64);
    const oldImage = `sha256:${'0'.repeat(64)}`;
    jest.mocked(managedSsh).mockImplementation(async (_access, key, header, _signal, payload) => {
      expect(key).toBe(credentials.privateKey);
      if (header.startsWith('inspect ')) return `${MANAGED_HELPER_PROTOCOL}\n${installed}\n${oldImage} true\n`;
      if (header.startsWith('installer-publish ')) {
        const source = (payload as Buffer).toString();
        expect(source).toBe(managedHostHelper(artifact));
        installed = createHash('sha256').update(source).digest('hex');
        expect(header).toBe(
          `installer-publish ${credentials.token} ${installed} ${Buffer.byteLength(source)} ${signInstaller(credentials.installerPrivateKey, credentials.token, source)}`,
        );
      }
      if (header.startsWith('activate ')) {
        policyConfirmed = false;
        await new Promise((resolve) => setTimeout(resolve, 5));
        boot = '00000000-0000-4000-8000-000000000002';
        heartbeat(1, {
          imageId: artifact.imageId,
          streamId: boot,
          sequence: ++sequence,
          timestamp: Date.now(),
          receivedAt: Date.now(),
        });
      }
      return 'OK\n';
    });
    rootProbe.mockClear();
    restarted.onApplicationBootstrap();
    heartbeat(1, { imageId: oldImage, streamId: boot, sequence, timestamp: Date.now(), receivedAt: Date.now() });
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        const status = await restarted.status(1);
        if (status.update?.phase === 'current' && status.update.token === null) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(await restarted.status(1)).toMatchObject({
        management: 'managed',
        runtime: {
          runningVersion: current.runtimeVersion,
          runningImageId: artifact.imageId,
          desiredVersion: artifact.manifest.runtimeVersion,
          desiredImageId: artifact.imageId,
        },
        update: {
          phase: 'current',
          token: null,
          desiredImageId: artifact.imageId,
          previousRuntimeVersion: current.runtimeVersion,
          desiredRuntimeVersion: artifact.manifest.runtimeVersion,
        },
      });
      expect(rootProbe).not.toHaveBeenCalled();
      expect(jest.mocked(managedSsh).mock.calls.map((call) => call[2].split(' ')[0])).toEqual(
        expect.arrayContaining(['installer-publish', 'stage', 'activate', 'accept', 'acknowledge']),
      );
      expect(
        (await db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access WHERE session_id = 1'))[0]
          .encrypted_credentials,
      ).toBe(envelope);
    } finally {
      await restarted.onModuleDestroy();
      await new Promise(setImmediate);
    }
  });
});

describe('fixed managed executor and recovery programs', () => {
  it('reports the legacy receiver capability without taking the mutation lock', () => {
    const fixture = fw31ShellFixture();
    try {
      fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
      fixture.file('etc/attraccess-wago/install.lock', '');
      fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
      const request = Buffer.from(`receiver-status ${'a'.repeat(32)}\n`);
      const helper = managedHostHelper(artifact, fixture.root);
      expect(fixture.run(helper, 'supervisor-lock-held', request).stdout).toBe('head-byte-count supported\n');
      rmSync(join(fixture.root, 'bin/head'));
      fixture.file('bin/head', '#!/bin/sh\nexit 1\n', 0o700);
      const unsupported = fixture.run(helper, 'supervisor-lock-held', request);
      expect({ status: unsupported.status, stdout: unsupported.stdout, stderr: unsupported.stderr }).toEqual({ status: 0, stdout: 'head-byte-count unsupported\n', stderr: '' });
      expect(fixture.run(helper, '', Buffer.from(`receiver-status ${'b'.repeat(32)}\n`)).status).not.toBe(0);
    } finally { fixture.dispose(); }
  });
  it.each(['native', 'terse'] as const)('reports update storage requirements without writing controller state (%s stat)', statStyle => {
    const fixture = fw31ShellFixture(statStyle);
    try {
      fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
      fixture.file('etc/attraccess-wago/install.lock', '');
      fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
      const containers = fixture.read('containers.json');
      const result = fixture.run(managedHostHelper(artifact, fixture.root), 'supervisor-lock-held', Buffer.from(`storage-status ${'a'.repeat(32)}\n`));
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      expect(result.stdout).toBe(['/var/lib', '/var/lib'].map(path => `${fixture.root}${path} 999999 16704 disk /fixture\n`).join(''));
      expect(fixture.read('containers.json')).toBe(containers);
      expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-update-transaction'))).toBe(false);
      expect(fixture.run(managedHostHelper(artifact, fixture.root), '', Buffer.from(`storage-status ${'b'.repeat(32)}\n`)).status).not.toBe(0);
      rmSync(join(fixture.root, 'etc/attraccess-wago'), { recursive: true });
      expect(fixture.run(managedHostHelper(artifact, fixture.root), '', Buffer.from(`storage-status ${'a'.repeat(32)}\n`)).status).not.toBe(0);
      expect(existsSync(join(fixture.root, 'etc/attraccess-wago'))).toBe(false);
    } finally {
      fixture.dispose();
    }
  });
  it.each(['native', 'terse'] as const)('inspects the running image without interrupting a busy hardware supervisor (%s stat)', statStyle => {
    const fixture = fw31ShellFixture(statStyle);
    try {
      fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
      fixture.file('bin/cut', '#!/bin/sh\nexec /usr/bin/cut "$@"\n', 0o700);
      fixture.file('etc/attraccess-wago/install.lock', '');
      const helper = managedHostHelper(artifact, fixture.root);
      fixture.file('usr/sbin/attraccess-wago-management', helper, 0o700);
      const containers = JSON.stringify([{ id: 'a'.repeat(64), name: 'attraccess-wago', imageId: artifact.imageId, running: true }]);
      fixture.file('containers.json', containers);
      const result = fixture.run(helper, 'supervisor-lock-held', Buffer.from(`inspect ${'a'.repeat(32)}\n`));
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      expect(result.stdout).toMatch(new RegExp(`^${MANAGED_HELPER_PROTOCOL}\\n[a-f0-9]{64}\\n${artifact.imageId} true\\n$`));
      expect(fixture.read('containers.json')).toBe(containers);
      expect(fixture.read('usr/sbin/attraccess-wago-management')).toBe(helper);
    } finally {
      fixture.dispose();
    }
  });
  it('uses the same RTU contract in stage, activation, acceptance and recovery, and preserves fixed diagnostic categories', () => {
    const helper = managedHostHelper({
      ...artifact,
      manifest: {
        ...artifact.manifest,
        hardware: { ...artifact.manifest.hardware, profile: 'cc100-751-9301-fw31-digital-rtu-v1' },
      },
    });
    const comparisons = [...helper.matchAll(/cat "\$tx\/profile"\)" = '([^']+)'/g)].map((entry) => entry[1]);
    expect(comparisons).toHaveLength(5);
    expect(new Set(comparisons)).toEqual(new Set(['cc100-751-9301-fw31-digital-rtu-v1']));
    expect(managedSshFailure('Insufficient update journal storage', 'transfer')).toBe('storage');
    expect(managedSshFailure('Runtime load failed', 'transfer')).toBe('load');
    expect(managedSshFailure('codesys-boot-enabled', 'transfer')).toBe('codesys_boot_enabled');
    expect(managedSshFailure('codesys-active', 'transfer')).toBe('codesys_active');
    expect(managedSshFailure('missing-register', 'transfer')).toBe('io_unavailable');
    expect(managedSshFailure('output-host-process-conflict', 'transfer')).toBe('writer_conflict');
    expect(managedSshFailure('Permission denied (publickey).', 'offline')).toBe('authentication');
    expect(managedSshFailure("flock: invalid option -- 'w'\nBusyBox v1.37.0 () multi-call binary.", 'offline')).toBe('lock_tools');
    expect(managedSshFailure('unexpected remote fixture-secret text', 'transfer')).toBe('transfer');
  });
  it.each(['native', 'terse'] as const)(
    'provisions on actual FW31 tools without chpasswd, getent or visudo and restores interrupted cutover/reboot (%s stat)',
    (statStyle) => {
      const fixture = fw31ShellFixture(statStyle);
      try {
        const node = (name: string, source: string) =>
          fixture.file(`bin/${name}`, `#!${process.execPath}\n${source}`, 0o700);
        fixture.file('accounts.json', JSON.stringify({ root: { uid: 0, gid: 0, home: '/root' } }));
        fixture.file('groups.json', JSON.stringify({ root: 0 }));
        node(
          'id',
          `const fs=require('fs'),r=process.env.FIXTURE_ROOT,a=JSON.parse(fs.readFileSync(r+'/accounts.json')),args=process.argv.slice(2),u=a[args[0]?.startsWith('-')?(args[1]||'root'):(args[0]||'root')];if(!u)process.exit(1);if(args[0]==='-u')console.log(u.uid);else if(args[0]==='-g')console.log(u.gid);`,
        );
        node(
          'groupadd',
          `const fs=require('fs'),r=process.env.FIXTURE_ROOT,g=JSON.parse(fs.readFileSync(r+'/groups.json'));g.attraccess=1111;fs.writeFileSync(r+'/groups.json',JSON.stringify(g));fs.writeFileSync(r+'/etc/group',Object.entries(g).map(([n,id])=>n+':x:'+id+':').join('\\n')+'\\n');`,
        );
        node(
          'useradd',
          `const fs=require('fs'),r=process.env.FIXTURE_ROOT,a=JSON.parse(fs.readFileSync(r+'/accounts.json'));a.attraccess={uid:1111,gid:1111,home:r+'/home/attraccess'};fs.writeFileSync(r+'/accounts.json',JSON.stringify(a));fs.mkdirSync(r+'/home/attraccess',{recursive:true,mode:0o700});fs.writeFileSync(r+'/etc/passwd',Object.entries(a).map(([n,u])=>n+':x:'+u.uid+':'+u.gid+'::'+u.home+':/bin/sh').join('\\n')+'\\n');`,
        );
        node(
          'passwd',
          `const fs=require('fs'),crypto=require('crypto'),r=process.env.FIXTURE_ROOT,text=fs.readFileSync(0,'utf8').trim().split('\\n');if(text.length!==2||text[0]!==text[1])process.exit(1);const file=r+'/password-hashes.json',hashes=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};hashes[process.argv.at(-1)]=crypto.scryptSync(text[0],'isolated-fixture',32).toString('hex');fs.writeFileSync(file,JSON.stringify(hashes));`,
        );
        fixture.file('bin/cut', '#!/bin/sh\nexec /usr/bin/cut "$@"\n', 0o700);
        fixture.file('bin/sudo', '#!/bin/sh\nexit 0\n', 0o700);
        fixture.file('etc/sudoers', '#includedir ' + fixture.root + '/etc/sudoers.d\n');
        fixture.file('usr/sbin/dropbear', '#!/bin/sh\necho "Dropbear v2025.88"\n', 0o700);
        fixture.file('etc/sudoers.d/fixture', '');
        fixture.file('etc/init.d/dropbear', '#!/bin/sh\nprintf old-policy >> "$FIXTURE_ROOT/ssh-restarts"\n', 0o755);
        const token = 'a'.repeat(32),
          key = generateManagementKey(),
          password = 'b'.repeat(43);
        const success = (result: ReturnType<typeof fixture.run>) =>
          expect({
            status: result.status,
            stderr: result.stderr,
            failure: result.stdout.match(/WAGO_MANAGEMENT_FAILURE=([a-z]+)/)?.[1],
          }).toEqual({ status: 0, stderr: '', failure: undefined });
        fixture.file(
          'accounts.json',
          JSON.stringify({
            root: { uid: 0, gid: 0, home: '/root' },
            attraccess: { uid: 1111, gid: 1111, home: fixture.root + '/home/attraccess' },
          }),
        );
        expect(
          fixture.run(
            managedProvisionScript(
              token,
              key.publicKey,
              password,
              managedHostHelper(artifact, fixture.root),
              fixture.root,
            ),
          ).status,
        ).not.toBe(0);
        expect(existsSync(join(fixture.root, 'password-hashes.json'))).toBe(false);
        fixture.file('accounts.json', JSON.stringify({ root: { uid: 0, gid: 0, home: '/root' } }));
        success(
          fixture.run(
            managedProvisionScript(
              token,
              key.publicKey,
              password,
              managedHostHelper(artifact, fixture.root),
              fixture.root,
            ),
          ),
        );
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(
          `command="${fixture.root}/usr/bin/sudo -n ${fixture.root}/usr/sbin/attraccess-wago-management"`,
        );
        expect(fixture.read('etc/sudoers.d/attraccess-wago')).toContain('NOPASSWD:');
        const hashes = JSON.parse(fixture.read('password-hashes.json'));
        expect(hashes.root).toBe(scryptSync(password, 'isolated-fixture', 32).toString('hex'));
        expect(hashes.attraccess).not.toBe(hashes.root);
        // Re-enrolment stages an additional key; cleanup only follows a fresh
        // key-only proof persisted by the server. Both old and new work meanwhile.
        const replacement = generateManagementKey();
        success(
          fixture.run(
            managedProvisionScript(
              token,
              replacement.publicKey,
              password,
              managedHostHelper(artifact, fixture.root),
              fixture.root,
            ),
          ),
        );
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(key.publicKey);
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(replacement.publicKey);
        success(
          fixture.run(managedHostHelper(artifact, fixture.root), '', Buffer.from(`access-key-commit ${token}\n`)),
        );
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).not.toContain(key.publicKey);
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(replacement.publicKey);
        success(
          fixture.run(managedHostHelper(artifact, fixture.root), '', Buffer.from(`access-key-commit ${token}\n`)),
        );
        success(fixture.run(managedCutoverScript(token, fixture.root)));
        expect(fixture.read('etc/init.d/dropbear')).toContain('-G attraccess -w -s');
        success(fixture.run(`set -- boot\n${managedWatchdogScript(fixture.root)}`));
        // Boot arms a fresh bounded watchdog, allowing managed reboot verification.
        expect(fixture.read('etc/init.d/dropbear')).toContain('-G attraccess');
        success(fixture.run(`set --\n${managedWatchdogScript(fixture.root)}`));
        expect(fixture.read('etc/init.d/dropbear')).not.toContain('-G attraccess');
        // Retrying with the same verified generated identity must survive a second cutover.
        success(fixture.run(managedCutoverScript(token, fixture.root)));
        success(fixture.run(managedCommitScript(token, fixture.root)));
        success(fixture.run(`set -- boot\n${managedWatchdogScript(fixture.root)}`));
        expect(fixture.read('etc/init.d/dropbear')).toContain('-G attraccess -w -s');
        expect(fixture.read('password-hashes.json')).not.toContain(password);
        const helper = managedHostHelper(artifact, fixture.root);
        expect(fixture.run(helper, '', Buffer.from(`access-retire ${token}\n`)).status).not.toBe(0);
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(replacement.publicKey);
        success(fixture.run(helper, '', Buffer.from(`access-restore ${token}\n`)));
        const previousPolicy = fixture.read('etc/attraccess-wago-management/dropbear.previous');
        fixture.file('etc/attraccess-wago-management/dropbear.previous', '#!/bin/sh\nexit 1\n', 0o700);
        expect(fixture.run(`set -- restore\n${managedWatchdogScript(fixture.root)}`).status).not.toBe(0);
        expect(existsSync(join(fixture.root, 'etc/attraccess-wago-management/cutover'))).toBe(true);
        fixture.file('etc/attraccess-wago-management/dropbear.previous', previousPolicy, 0o700);
        success(fixture.run(`set -- restore\n${managedWatchdogScript(fixture.root)}`));
        // Repeating restoration must not recreate cutover or block key retirement.
        success(fixture.run(helper, '', Buffer.from(`access-restore ${token}\n`)));
        expect(existsSync(join(fixture.root, 'etc/attraccess-wago-management/cutover'))).toBe(false);
        success(fixture.run(helper, '', Buffer.from(`access-retire ${token}\n`)));
        expect(existsSync(join(fixture.root, 'home/attraccess/.ssh/authorized_keys'))).toBe(false);
        expect(existsSync(join(fixture.root, 'etc/attraccess-wago-management/key.pending'))).toBe(false);
        success(fixture.run(helper, '', Buffer.from(`access-retire ${token}\n`)));
      } finally {
        fixture.dispose();
      }
    },
  );
  it.each(['', 'supervisor-lock-held', 'bootstrap-refresh'])(
    'accepts real commissioning journals in dependency order and fences foreign tokens before cleanup (%s)',
    (lockState) => {
    const fixture = fw31ShellFixture();
    try {
      fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
      const token = 'a'.repeat(32);
      const success = (result: ReturnType<typeof fixture.run>) =>
        expect({
          status: result.status,
          stderr: result.stderr,
          failure: result.stdout.match(/WAGO_MANAGEMENT_FAILURE=([a-z]+)/)?.[1],
        }).toEqual({ status: 0, stderr: '', failure: undefined });
      fixture.file('bundle/image-reference', artifact.image + '\n');
      fixture.file('bundle/image.tar', 'compressed fixture image');
      const archive = join(fixture.root, 'tmp/install.tar');
      expect(
        spawnSync('/usr/bin/tar', ['-cf', archive, '-C', join(fixture.root, 'bundle'), 'image-reference', 'image.tar'])
          .status,
      ).toBe(0);
      const bundle = readFileSync(archive);
      fixture.file('etc/attraccess-wago/docker-provision/token', token + '\n');
      fixture.file('etc/attraccess-wago/docker-provision/mode', 'destructive\n');
      fixture.file('etc/attraccess-wago/docker-provision/started', '');
      success(
        fixture.run(
          runtimeBundleDeliveryScript(
            artifact.image,
            'MQTT=permanent',
            null,
            bundle.length,
            createHash('sha256').update(bundle).digest('hex'),
            token,
            fixture.root,
          ),
          '',
          bundle,
        ),
      );
      const helper = managedHostHelper(artifact, fixture.root);
      const management = { token: 'c'.repeat(32), helper, watchdog: managedWatchdogScript(fixture.root) };
      if (lockState === 'bootstrap-refresh') {
        fixture.file('etc/attraccess-wago-management/token', management.token + '\n');
        fixture.file('etc/attraccess-wago-management/watchdog', '#!/bin/sh\nexit 43\n', 0o700);
        fixture.file('usr/sbin/attraccess-wago-management', '#!/bin/sh\nexit 42\n', 0o700);
        expect(fixture.run(commissioningAcceptanceScript(token, fixture.root, false, { ...management, token: 'd'.repeat(32) })).status).not.toBe(0);
        expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction/started'))).toBe(true);
        expect(fixture.read('etc/attraccess-wago-management/watchdog')).toContain('exit 43');
      }
      const acceptance = lockState === 'bootstrap-refresh'
        ? commissioningAcceptanceScript(token, fixture.root, false, management)
        : helper;
      const input = lockState === 'bootstrap-refresh' ? undefined : Buffer.from(`commissioning-accept ${token}\n`);
      expect(fixture.run(helper, '', Buffer.from(`commissioning-accept ${'b'.repeat(32)}\n`)).status).not.toBe(0);
      expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction/started'))).toBe(true);
      const bounded = fixture.run(acceptance, 'lock-wait-expired', input);
      expect(bounded.status).not.toBe(0);
      expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction/started'))).toBe(true);
      success(fixture.run(acceptance, lockState, input));
      if (lockState === 'bootstrap-refresh') {
        expect(fixture.read('usr/sbin/attraccess-wago-management')).toBe(helper);
        expect(fixture.read('etc/attraccess-wago-management/watchdog')).toBe(management.watchdog);
      }
      expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction'))).toBe(false);
      expect(existsSync(join(fixture.root, `etc/attraccess-wago/docker-provision.completed-${token}/accepted`))).toBe(
        true,
      );
      success(fixture.run(helper, '', Buffer.from(`commissioning-accept ${token}\n`)));
      expect(fixture.containers()[0]).toMatchObject({ running: true });
      expect(fixture.read('etc/attraccess-wago/runtime.env')).toBe('MQTT=permanent');
    } finally {
      fixture.dispose();
    }
  });
  it.each(['native', 'terse'] as const)('executes a full repeated image update through only the fixed dispatcher, preserving enrolled state (%s stat)', (statStyle) => {
    const fixture = fw31ShellFixture(statStyle);
    try {
      fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
      fixture.file('etc/attraccess-wago/runtime.env', 'WAGO_MQTT_PASSWORD=permanent-fixture-secret');
      fixture.file('etc/attraccess-wago/runtime-enabled', '');
      fixture.file('etc/attraccess-wago/install.lock', '');
      fixture.file('var/lib/attraccess-wago/state.json', 'enrolled-state');
      fixture.file(
        'owners.json',
        JSON.stringify({ ...JSON.parse(fixture.read('owners.json')), '/var/lib/attraccess-wago': '10001:10001' }),
      );
      fixture.setContainers([
        {
          id: 'old-id',
          name: 'attraccess-wago',
          running: true,
          restart: 'no',
          imageId: `sha256:${'9'.repeat(64)}`,
          mounts: [fixture.root + WAGO_DIN, fixture.root + WAGO_DOUT],
        },
      ]);
      fixture.file('loaded-image-id', artifact.imageId);
      fixture.file('bundle/image-reference', artifact.image + '\n');
      fixture.file('bundle/image.tar', 'compressed image fixture');
      const file = join(fixture.root, 'tmp/update.tar');
      expect(
        spawnSync('/usr/bin/tar', ['-cf', file, '-C', join(fixture.root, 'bundle'), 'image-reference', 'image.tar'])
          .status,
      ).toBe(0);
      const bundle = readFileSync(file),
        digest = createHash('sha256').update(bundle).digest('hex');
      const helper = managedHostHelper(artifact, fixture.root),
        token = '5'.repeat(32);
      const run = (header: string, bytes = Buffer.alloc(0)) =>
        fixture.run(helper, '', Buffer.concat([Buffer.from(header + '\n'), bytes]));
      const success = (result: ReturnType<typeof run>) =>
        expect({
          status: result.status,
          stderr: result.stderr,
          failure: result.stdout.match(/WAGO_MANAGEMENT_FAILURE=([a-z]+)/)?.[1],
        }).toEqual({ status: 0, stderr: '', failure: undefined });
      success(run(`proof ${token}`));
      expect(run(`stage ${token} ${digest} ${bundle.length} ${artifact.imageId} arbitrary-image`).status).not.toBe(0);
      success(run(`stage ${token} ${digest} ${bundle.length} ${artifact.imageId} ${artifact.image}`, bundle));
      expect(run(`activate ${'6'.repeat(32)}`).status).not.toBe(0);
      success(run(`activate ${token}`));
      success(run(`accept ${token}`));
      success(run(`acknowledge ${token}`));
      success(run(`acknowledge ${token}`));
      expect(fixture.read('var/lib/attraccess-wago/state.json')).toBe('enrolled-state');
      expect(fixture.read('etc/attraccess-wago/runtime.env')).toContain('permanent-fixture-secret');
      expect(fixture.containers()).toHaveLength(1);
      expect(fixture.containers()[0]).toMatchObject({ imageId: artifact.imageId, running: true });
    } finally {
      fixture.dispose();
    }
  });
  it('generates valid POSIX shell with dynamic bounded artifact parameters, no supplied scripts/eval', () => {
    const helper = managedHostHelper(artifact);
    const key = generateManagementKey();
    for (const script of [
      helper,
      managedProvisionScript('a'.repeat(32), key.publicKey, 'b'.repeat(43), helper),
      managedCutoverScript('a'.repeat(32)),
      managedCommitScript('a'.repeat(32)),
      managedAccessWatchdog,
    ]) {
      const result = spawnSync('/bin/sh', ['-n'], { input: script, encoding: 'utf8' });
      expect({
        status: result.status,
        stderr: result.stderr,
        failure: result.stdout.match(/WAGO_MANAGEMENT_FAILURE=([a-z]+)/)?.[1],
      }).toEqual({ status: 0, stderr: '', failure: undefined });
    }
    expect(helper).toContain('sh "$tx/bundle.tar" "$((bytes + 1))"');
    expect(helper).toContain('-v b="$kib"');
    expect(helper).toContain('"${token}"');
    expect(helper).not.toMatch(/\beval\b|\b1234567\b|'\$\{token\}'/);
    expect(helper).toContain('*) exit 1 ;;');
  });

  it('migrates credential/update/operation storage together and refuses destructive downgrade with credentials', async () => {
    const db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation],
      migrations: [WagoManagedUpdates1780010650000],
    }).initialize();
    try {
      await db.runMigrations();
      await db.query(
        "INSERT INTO plugin_wago_managed_access VALUES (1, NULL, '10.0.0.1', 'pin', 'token', 'pending', 'ciphertext', 'key-pin')",
      );
      await expect(db.undoLastMigration()).rejects.toThrow('Retire managed');
    } finally {
      await db.destroy();
    }
  });
});
