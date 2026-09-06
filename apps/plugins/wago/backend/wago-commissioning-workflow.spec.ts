import { DataSource } from 'typeorm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import plugin from './plugin';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoManagementEntity } from './wago-management.entity';
import { WagoService } from './wago.service';
import { WagoController } from './wago-controller.entity';
import { AddWagoCommissioningPrincipal1780000000009 } from './migrations/1780000000009-add-wago-commissioning-principal';

describe('commissioning workflows with a real isolated database and mocked device transport', () => {
  let db: DataSource;
  let directory: string;
  let service: WagoCommissioningService;
  let context: PluginContext;
  let session: WagoCommissioningSession;
  let artifacts: { has: jest.Mock; acquire: jest.Mock };
  const principal = { userId: 42, authenticationMethod: 'session' as const };
  const credential = { username: 'root', password: 'fixture-only' };
  const digest = 'a'.repeat(64);
  const stoppedReport =
    'version=1\nplatform=supported\nhardware=accessible\nexclusivity=clear\ndocker=installed-stopped\nconfigDocker=present\nprovision=review-start-installed-runtime\nqualification=required\n';
  const wago = {
    registerCommissioningDiscoveryHandler: jest.fn(),
    revokeEnrollmentById: jest.fn().mockResolvedValue(undefined),
    createEnrollment: jest.fn().mockResolvedValue({
      id: 7,
      password: 'bootstrap-fixture',
      username: 'fixture',
      claimSecret: 'claim-fixture',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'wago-workflow-fixture-'));
    db = new DataSource({ type: 'sqlite', database: ':memory:', entities: plugin.entities, synchronize: true });
    await db.initialize();
    context = {
      getRepository: (entity) => db.getRepository(entity),
      secrets: { encrypt: () => 'ciphertext', decrypt: () => 'v'.repeat(43) },
      logger: { warn: jest.fn() },
      audit: { record: jest.fn().mockResolvedValue({ status: 'recorded' }) },
      getMqttServerConfig: jest.fn().mockResolvedValue({ host: 'broker.example.test', port: 8883, useTls: true }),
      getMqttCredentialProvisioning: () => ({ availableProviders: async () => [{ providerId: 'fixture' }] }),
    } as unknown as PluginContext;
    artifacts = {
      has: jest.fn().mockResolvedValue(true),
      acquire: jest.fn().mockResolvedValue({
        digest,
        bytes: 512,
        image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${digest}`,
        path: join(directory, 'runtime.tar'),
        directory,
      }),
    };
    service = new WagoCommissioningService(
      context,
      wago as unknown as WagoService,
      artifacts as unknown as WagoRuntimeArtifactsService,
    );
    await service.onApplicationBootstrap();
    session = await db.getRepository(WagoCommissioningSession).save({
      hardwareId: 'fixture',
      mqttServerId: 1,
      targetHost: '10.99.0.1',
      hostKeyFingerprint: `SHA256:${'A'.repeat(43)}`,
      firmwareBaseline: '31',
      controllerName: 'Fixture',
      state: 'awaiting_delivery',
      pairingCode: 'encrypted:v1:ciphertext',
      auditLog: '[]',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runtimeArtifactDigest: digest,
    });
    jest
      .spyOn(service as never, 'inspect')
      .mockResolvedValue({ firmware: 'PTXDIST_PLATFORM_NAME="cc100"\nVERSION_ID="31"', codesys: 'inactive' } as never);
  });
  afterEach(async () => {
    await db.destroy();
    await rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('pins the artifact and carries the reviewed Docker token into the runtime transaction', async () => {
    const remote = jest.spyOn(service as never, 'sudoRunScript').mockResolvedValue(stoppedReport as never);
    await service.platform(session.id, 'inspect', { temporarySsh: credential }, principal);
    const activated = await service.platform(
      session.id,
      'activate',
      { temporarySsh: credential, reviewedDockerActivation: true },
      principal,
    );
    expect(activated.dockerProvisionState).toBe('started');
    expect(activated).not.toHaveProperty('dockerProvisionToken');
    const saved = await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: session.id });
    expect(saved.dockerProvisionToken).toMatch(/^[a-f0-9]{32}$/);
    remote.mockResolvedValue('' as never);
    const copy = jest.spyOn(service as never, 'copyTo').mockResolvedValue(undefined as never);
    const delivered = await service.deliver(session.id, { confirmInstall: true, temporarySsh: credential }, principal);
    expect(delivered.state).toBe('awaiting_discovery');
    expect(artifacts.acquire).toHaveBeenCalledWith(digest);
    const script = copy.mock.calls[0][4] as string;
    expect(script).toContain(saved.dockerProvisionToken!);
    expect(script).toContain('WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-v1');
    expect(script).toContain('--user 10001:10001 --cap-drop ALL');
    expect(JSON.stringify(delivered)).not.toContain('bootstrap-fixture');
    expect((await service.list())[0]).not.toHaveProperty('deliveryToken');
    expect((await service.list())[0]).not.toHaveProperty('initiatingPrincipal');
  });

  it('serializes separate service instances before either can touch the same controller', async () => {
    let release!: (value: string) => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    jest.spyOn(service as never, 'sudoRunScript').mockImplementation(() => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      }) as never;
    });
    const other = new WagoCommissioningService(context, wago as unknown as WagoService);
    // Binding the shared repository is enough; do not run startup recovery against active work.
    other['sessions'] = db.getRepository(WagoCommissioningSession);
    const otherRemote = jest.spyOn(other as never, 'sudoRunScript');
    const first = service.platform(session.id, 'inspect', { temporarySsh: credential });
    await ready;
    await expect(other.platform(session.id, 'inspect', { temporarySsh: credential })).rejects.toThrow('lease_busy');
    expect(otherRemote).not.toHaveBeenCalled();
    const controller = await db.getRepository(WagoController).save({
      hardwareId: session.hardwareId,
      trustState: 'claimed',
      mqttServerId: 1,
      pairingCodeHash: 'fixture',
      protocolVersion: '1.0.0',
      runtimeVersion: '0.1.0',
      capabilities: '[]',
      lastSequence: 0,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const remove = jest.fn().mockResolvedValue(session.hardwareId);
    await expect(other.removeControllerSafely(controller.id, remove)).rejects.toThrow('lease_busy');
    expect(remove).not.toHaveBeenCalled();
    expect(await db.getRepository(WagoController).findOneBy({ id: controller.id })).not.toBeNull();
    release(stoppedReport);
    await first;
    expect(await service.operationStatus(session.id)).toEqual({ state: 'available' });
  });

  it('retains tokened recovery after registration removal, without exposing the token', async () => {
    const controller = await db.getRepository(WagoController).save({
      hardwareId: session.hardwareId,
      trustState: 'claimed',
      mqttServerId: 1,
      pairingCodeHash: 'fixture',
      protocolVersion: '1.0.0',
      runtimeVersion: '0.1.0',
      capabilities: '[]',
      lastSequence: 0,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.getRepository(WagoCommissioningSession).update(session.id, { deliveryToken: 'b'.repeat(32) });
    await service.removeControllerSafely(controller.id, async (assertOwned) => {
      await assertOwned();
      await db.getRepository(WagoController).delete(controller.id);
      return session.hardwareId;
    });
    const retained = (await service.list())[0];
    expect(retained).toMatchObject({ state: 'revoked', runtimeRecoveryAvailable: true });
    expect(retained).not.toHaveProperty('deliveryToken');
    jest.spyOn(service as never, 'sudoRunScript').mockResolvedValue('' as never);
    const restored = await service.recover(session.id, { confirmInstall: true, temporarySsh: credential });
    expect(restored.progressStep).toBe('Runtime snapshot restored');
    expect(restored.runtimeRecoveryAvailable).toBeUndefined();
  });

  it('retires superseded sessions without deadlocking a queued revocation', async () => {
    const { id: _id, ...values } = session;
    void _id;
    const second = await db.getRepository(WagoCommissioningSession).save(values);
    let entered!: () => void;
    let proceed!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const next = new Promise<void>((resolve) => {
      proceed = resolve;
    });
    const first = service['withControllerLock'](session.id, async () => {
      entered();
      await next;
      await service['retireSupersededSessions'](session.hardwareId, session.id);
    });
    await ready;
    const revoke = service.revoke(second.id);
    await new Promise((resolve) => setImmediate(resolve));
    proceed();
    await Promise.all([first, revoke]);
    expect((await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: second.id })).state).toBe('revoked');
  });

  it('allows session deletion after read-only management inspection without requiring impossible rollback', async () => {
    await db.getRepository(WagoManagementEntity).save({
      controllerId: 9,
      leaseUntil: 0,
      metadataJson: JSON.stringify({
        target: { controllerId: 9, host: session.targetHost, hostKeyFingerprint: session.hostKeyFingerprint },
        state: 'inspected',
        inspection: null,
        mode: null,
        exceptions: [],
        support: 'qualification_required',
        reviewToken: null,
        reviewedAt: null,
        transaction: null,
        keyFingerprint: null,
        failure: null,
      }),
    });
    await db.getRepository(WagoCommissioningSession).update(session.id, { managementControllerId: 9 });
    await service.remove(session.id);
    expect(await db.getRepository(WagoCommissioningSession).findOneBy({ id: session.id })).toBeNull();
  });

  it('does not retain an inspection-only session after controller registration removal', async () => {
    await db
      .getRepository(WagoController)
      .save({
        id: 9,
        hardwareId: session.hardwareId,
        trustState: 'claimed',
        mqttServerId: 1,
        pairingCodeHash: 'fixture',
        protocolVersion: '1.0.0',
        runtimeVersion: '0.1.0',
        capabilities: '[]',
        lastSequence: 0,
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    await db.getRepository(WagoManagementEntity).save({
      controllerId: 9,
      leaseUntil: 0,
      metadataJson: JSON.stringify({
        target: { controllerId: 9, host: session.targetHost, hostKeyFingerprint: session.hostKeyFingerprint },
        state: 'inspected',
        inspection: null,
        mode: null,
        exceptions: [],
        support: 'qualification_required',
        reviewToken: null,
        reviewedAt: null,
        transaction: null,
        keyFingerprint: null,
        failure: null,
      }),
    });
    await db.getRepository(WagoCommissioningSession).update(session.id, { managementControllerId: 9 });
    await service.removeControllerSafely(9, async (assertOwned) => {
      await assertOwned();
      await db.getRepository(WagoController).delete(9);
      return session.hardwareId;
    });
    expect(await service.list()).toEqual([]);
  });

  it('refuses a downgrade that would discard a Docker recovery token', async () => {
    await db.getRepository(WagoCommissioningSession).update(session.id, { dockerProvisionToken: 'c'.repeat(32) });
    const runner = db.createQueryRunner();
    try {
      await expect(new AddWagoCommissioningPrincipal1780000000009().down(runner)).rejects.toThrow('Recover Docker provisioning');
      expect((await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: session.id })).dockerProvisionToken).toBe('c'.repeat(32));
    } finally { await runner.release(); }
  });
});
