import { DataSource } from 'typeorm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import plugin from './plugin';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoManagementEntity } from './wago-management.entity';
import { WagoService } from './wago.service';
import { WagoController } from './wago-controller.entity';
import { AddWagoCommissioningPrincipal1780000000009 } from './migrations/1780000000009-add-wago-commissioning-principal';
import { fw31IdentityOutput } from './fixtures/fw31-identity';
import { runtimeBundlePreflightScript, runtimeBundleStagingCapacityPreflightScript } from './wago-runtime-install';
import { WagoCommissioningProcessError } from './wago-commissioning-errors';

describe('commissioning workflows with a real isolated database and mocked device transport', () => {
  let db: DataSource;
  let directory: string;
  let service: WagoCommissioningService;
  let context: PluginContext;
  let session: WagoCommissioningSession;
  let artifacts: { has: jest.Mock; get: jest.Mock; acquire: jest.Mock };
  const principal = { userId: 42, authenticationMethod: 'session' as const };
  const credential = { username: 'root', password: 'fixture-only' };
  const digest = 'a'.repeat(64);
  const stoppedReport =
    'version=1\nplatform=supported\nhardware=accessible\nexclusivity=clear\ndocker=installed-stopped\nconfigDocker=present\nprovision=review-start-installed-runtime\nqualification=required\n';
  const clockOutput = () =>
    `epoch=${Math.floor(Date.now() / 1000)}\nuptime=100.00\nboot=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\ntool=supported\n`;
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
      get: jest.fn().mockResolvedValue({ digest }),
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
      .mockResolvedValue({ firmware: fw31IdentityOutput(), codesys: 'inactive' } as never);
  });
  afterEach(async () => {
    await db.destroy();
    await rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it.each(['verified', 'stale', 'unsupported', 'failed'])(
    'gates enrollment and TLS runtime delivery on %s clock correction',
    async (scenario) => {
      wago.createEnrollment.mockClear();
      const old = `epoch=1654436642\nuptime=100.00\nboot=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\ntool=${scenario === 'unsupported' ? 'unsupported' : 'supported'}\n`;
      let corrected = false;
      const order: string[] = [];
      const remote = jest.spyOn(service as never, 'sudoRunScript').mockImplementation((async (
        host,
        pin,
        passedCredential,
        script: string,
        limits,
      ) => {
        expect(host).toBe(session.targetHost);
        expect(pin).toBe(session.hostKeyFingerprint);
        expect(passedCredential).toEqual(credential);
        if (script.includes("printf 'epoch=")) {
          expect(limits).toEqual({ timeoutMs: 30000, maxOutputBytes: 4096 });
          order.push(corrected ? 'postcheck' : 'inspection');
          expect(wago.createEnrollment).not.toHaveBeenCalled();
          return corrected && scenario !== 'stale' ? clockOutput() : old;
        }
        if (script.includes('/etc/config-tools/config_clock type=utc')) {
          order.push('correct');
          expect(wago.createEnrollment).not.toHaveBeenCalled();
          if (scenario === 'failed') throw new Error('clock setter failed');
          corrected = true;
        }
        return '';
      }) as never);
      const copy = jest.spyOn(service as never, 'copyTo').mockImplementation((async () => {
        order.push('runtime');
        expect(wago.createEnrollment).toHaveBeenCalledTimes(1);
      }) as never);
      const result = await service.deliver(session.id, { confirmInstall: true, temporarySsh: credential }, principal);
      if (scenario === 'verified') {
        expect(result.state).toBe('awaiting_discovery');
        expect(order).toEqual(['inspection', 'correct', 'postcheck', 'runtime']);
        expect(JSON.parse(result.platformReport ?? 'null').clock).toMatchObject({
          result: 'synchronized',
          action: 'synchronize',
          skewSeconds: 0,
        });
      } else {
        expect(result.state).toBe('delivery_failed');
        expect(result.failureReason).toContain('UTC');
        expect(JSON.parse(result.platformReport ?? 'null').clock.result).toBe('failed');
        expect(wago.createEnrollment).not.toHaveBeenCalled();
        expect(copy).not.toHaveBeenCalled();
      }
      remote.mockRestore();
    },
  );

  it('never inspects or changes the clock when install consent is absent', async () => {
    const remote = jest.spyOn(service as never, 'sudoRunScript');
    wago.createEnrollment.mockClear();
    await expect(service.deliver(session.id, { temporarySsh: credential }, principal)).rejects.toThrow();
    expect(remote).not.toHaveBeenCalled();
    expect(wago.createEnrollment).not.toHaveBeenCalled();
  });

  it('rechecks clock continuity after enrollment revocation and before issuing a credential', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    jest
      .spyOn(service as never, 'sudoRunScript')
      .mockImplementation((async (_host, _pin, _credential, script: string) =>
        script.includes("printf 'epoch=") ? clockOutput() : '') as never);
    jest.spyOn(service as never, 'revokeSessionEnrollment').mockImplementation((async () => {
      jest.spyOn(Date, 'now').mockReturnValue(now + 10_000);
    }) as never);
    wago.createEnrollment.mockClear();
    const copy = jest.spyOn(service as never, 'copyTo');
    const result = await service.deliver(session.id, { confirmInstall: true, temporarySsh: credential }, principal);
    expect(result.state).toBe('delivery_failed');
    expect(wago.createEnrollment).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });

  it('blocks an unfinished preparation before any further host mutation', async () => {
    const token = 'c'.repeat(32);
    const repository = db.getRepository(WagoCommissioningSession);
    await repository.update(session.id, {
      platformReport: JSON.stringify({ platform: 'supported', provision: 'review-start-installed-runtime' }),
      dockerProvisionToken: token,
      dockerProvisionState: token ? 'starting' : null,
    });
    const before = await repository.findOneByOrFail({ id: session.id });
    const remote = jest.spyOn(service as never, 'sudoRunScript');
    await expect(
      service.platform(
        session.id,
        'activate',
        {
          temporarySsh: credential,
          reviewedDockerActivation: true,
        },
        principal,
      ),
    ).rejects.toThrow('retained controller preparation');
    expect(await repository.findOneByOrFail({ id: session.id })).toEqual(before);
    expect(remote).not.toHaveBeenCalled();
  });

  it('automatically cleans a failed preparation before retrying delivery', async () => {
    await db.getRepository(WagoCommissioningSession).update(session.id, {
      state: 'delivery_failed',
      dockerProvisionToken: 'c'.repeat(32),
      dockerProvisionState: 'recovery_required',
    });
    const order: string[] = [];
    jest.spyOn(service as never, 'cleanupControllerPreparation').mockImplementation((async (
      current: WagoCommissioningSession,
    ) => {
      order.push('cleanup');
      current.dockerProvisionToken = null;
      current.dockerProvisionState = null;
    }) as never);
    jest.spyOn(service as never, 'prepareController').mockImplementation((async () => {
      order.push('prepare');
      throw new Error('fixture preparation failure');
    }) as never);

    const result = await service.deliver(session.id, { confirmInstall: true, temporarySsh: credential }, principal);

    expect(order).toEqual(['cleanup', 'prepare']);
    expect(result.state).toBe('delivery_failed');
  });

  it('finalizes a retained started runtime instead of reinstalling it', async () => {
    await db.getRepository(WagoCommissioningSession).update(session.id, {
      state: 'delivery_failed',
      enrollmentId: 7,
      deliveryToken: 'd'.repeat(32),
      dockerProvisionToken: 'c'.repeat(32),
      dockerProvisionState: 'started',
    });
    const order: string[] = [];
    jest.spyOn(service as never, 'acceptRetainedRuntimeDelivery').mockImplementation((async (
      current: WagoCommissioningSession,
    ) => {
      order.push('runtime-finalize');
      current.deliveryToken = null;
      current.dockerProvisionToken = null;
      current.dockerProvisionState = null;
    }) as never);

    const result = await service.deliver(session.id, { confirmInstall: true, temporarySsh: credential }, principal);

    expect(order).toEqual(['runtime-finalize']);
    expect(result.state).toBe('awaiting_discovery');
  });

  it('reinstalls instead of accepting a running runtime whose bootstrap credential was revoked after a server crash', async () => {
    await db.getRepository(WagoCommissioningSession).update(session.id, {
      state: 'delivery_failed',
      enrollmentId: null,
      deliveryToken: 'd'.repeat(32),
      dockerProvisionToken: 'd'.repeat(32),
      dockerProvisionState: 'started',
    });
    const accept = jest.spyOn(service as never, 'acceptRetainedRuntimeDelivery').mockResolvedValue(undefined as never);
    const order: string[] = [];
    jest.spyOn(service as never, 'cleanupRetainedRuntimeDelivery').mockImplementation((async (
      current: WagoCommissioningSession,
    ) => {
      order.push('cleanup');
      current.deliveryToken = null;
      current.dockerProvisionToken = null;
    }) as never);
    jest.spyOn(service as never, 'prepareController').mockImplementation((async () => {
      order.push('prepare');
      throw new Error('fixture preparation stopped');
    }) as never);
    await service.deliver(session.id, { confirmInstall: true, temporarySsh: credential }, principal);
    expect(accept).not.toHaveBeenCalled();
    expect(order).toEqual(['cleanup', 'prepare']);
  });

  it('reconciles discovery received before the runtime upload finishes', async () => {
    jest
      .spyOn(service as never, 'sudoRunScript')
      .mockImplementation((async (_host, _pin, _credential, script: string) =>
        script.includes("printf 'epoch=") ? clockOutput() : '') as never);
    const claim = jest.spyOn(service, 'claimDiscovered').mockImplementation(async () => {
      const current = await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: session.id });
      if (current.state === 'awaiting_discovery')
        await db.getRepository(WagoCommissioningSession).update(current.id, { state: 'awaiting_verification' });
    });
    jest.spyOn(service as never, 'copyTo').mockImplementation((async () => {
      const controller = await db.getRepository(WagoController).save({
        hardwareId: session.hardwareId,
        mqttServerId: 1,
        enrollmentId: 7,
        trustState: 'untrusted',
        pairingCodeHash: 'fixture',
        protocolVersion: '1',
        runtimeVersion: 'fixture',
        capabilities: '[]',
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await service.claimDiscovered(controller);
    }) as never);
    await service.deliver(session.id, { confirmInstall: true, temporarySsh: credential }, principal);
    expect(claim).toHaveBeenCalledTimes(2);
    expect((await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: session.id })).state).toBe(
      'awaiting_verification',
    );
  });

  it('finishes enrollment from verified runtime evidence without requiring a browser poll or manual configuration', async () => {
    await db.getRepository(WagoCommissioningSession).update(session.id, { state: 'awaiting_verification' });
    const configure = jest.fn().mockResolvedValue(undefined);
    Object.assign(wago, { ensureCommissioningConfiguration: configure });
    jest.spyOn(service, 'verification').mockResolvedValue({
      controllerId: 17,
      permanentConnection: true,
      enrollmentRevoked: true,
      configurationApplied: true,
      hardwareReadiness: 'ready',
      enrollmentReady: true,
      softwareReady: false,
      managementHardening: 'unverified',
      physicalQualification: 'required',
      ready: false,
    } as never);
    await service['reconcileEnrollment'](session.id);
    expect(configure).toHaveBeenCalledWith(17);
    expect(await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: session.id })).toMatchObject({
      state: 'completed',
      progressPercent: 100,
    });
  });

  it.each(['No started runtime transaction to accept', 'Runtime container is not running'])(
    'cleans an unusable retained runtime and starts a fresh delivery (%s)',
    async (diagnostic) => {
      const token = 'd'.repeat(32);
      await db.getRepository(WagoCommissioningSession).update(session.id, {
        state: 'delivery_failed',
        enrollmentId: 7,
        deliveryToken: token,
        dockerProvisionToken: token,
        dockerProvisionState: 'started',
      });
      const order: string[] = [];
      jest.spyOn(service as never, 'acceptRetainedRuntimeDelivery').mockImplementation((async () => {
        order.push('accept');
        throw new WagoCommissioningProcessError('ssh', 1, 0, `${diagnostic}\n`);
      }) as never);
      jest.spyOn(service as never, 'cleanupRetainedRuntimeDelivery').mockImplementation((async (
        current: WagoCommissioningSession,
      ) => {
        order.push('reconcile');
        current.deliveryToken = null;
        current.dockerProvisionToken = null;
        current.dockerProvisionState = null;
      }) as never);
      jest.spyOn(service as never, 'prepareController').mockImplementation((async () => {
        order.push('prepare');
        throw new Error('fixture preparation failure');
      }) as never);

      const result = await service.deliver(session.id, { confirmInstall: true, temporarySsh: credential }, principal);

      expect(order).toEqual(['accept', 'reconcile', 'prepare']);
      expect(result).toMatchObject({ state: 'delivery_failed' });
      expect(
        (await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: session.id })).deliveryToken,
      ).toBeNull();
    },
  );

  it('activates under durable ownership and records CODESYS disabled only after preparation succeeds', async () => {
    const repository = db.getRepository(WagoCommissioningSession);
    const remote = jest.spyOn(service as never, 'sudoRunScript').mockImplementation((async (
      _host,
      _pin,
      _credential,
      script: string,
    ) => {
      const saved = await repository.findOneByOrFail({ id: session.id });
      expect(artifacts.acquire).toHaveBeenCalledWith(digest);
      if (script === runtimeBundleStagingCapacityPreflightScript(512)) {
        expect(saved.dockerProvisionToken).toBeNull();
        expect(saved.dockerProvisionState).toBeNull();
        return '';
      }
      expect(saved.dockerProvisionToken).toMatch(/^[a-f0-9]{32}$/);
      expect(saved.dockerProvisionState).toBe('starting');
      expect(saved.codesysState).not.toBe('disabled');
      return '';
    }) as never);
    const result = await service.platform(
      session.id,
      'activate',
      {
        temporarySsh: credential,
        reviewedDockerActivation: true,
      },
      principal,
    );
    expect(result).toMatchObject({ dockerProvisionState: 'started', codesysState: 'disabled', failureReason: null });
    expect(result).not.toHaveProperty('dockerProvisionToken');
    expect(remote).toHaveBeenCalledTimes(2);
    expect(remote.mock.calls[0][3]).toBe(runtimeBundleStagingCapacityPreflightScript(512));
    expect(existsSync(directory)).toBe(false);
  });

  it.each(['deliver', 'activate'] as const)(
    'blocks %s before tokens, PLC preparation, clock changes or enrollment when staging is insufficient',
    async (action) => {
      wago.createEnrollment.mockClear();
      const remote = jest.spyOn(service as never, 'sudoRunScript').mockImplementation((async (
        _host,
        _pin,
        _credential,
        script: string,
      ) => {
        expect(artifacts.acquire).toHaveBeenCalledWith(digest);
        expect(script).toBe(runtimeBundleStagingCapacityPreflightScript(512));
        const saved = await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: session.id });
        expect(saved.dockerProvisionToken).toBeNull();
        expect(saved.deliveryToken).toBeNull();
        throw new Error('Insufficient runtime storage');
      }) as never);
      const copy = jest.spyOn(service as never, 'copyTo');
      const result =
        action === 'deliver'
          ? await service.deliver(session.id, { confirmInstall: true, temporarySsh: credential }, principal)
          : await service.platform(
              session.id,
              'activate',
              { reviewedDockerActivation: true, temporarySsh: credential },
              principal,
            );
      expect(result.failureReason).toBeTruthy();
      expect(remote).toHaveBeenCalledTimes(1);
      expect(wago.createEnrollment).not.toHaveBeenCalled();
      expect(copy).not.toHaveBeenCalled();
      expect(await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: session.id })).toMatchObject({
        dockerProvisionToken: null,
        dockerProvisionState: null,
        deliveryToken: null,
        enrollmentId: null,
      });
      expect(existsSync(directory)).toBe(false);
    },
  );

  it.each(['deliver', 'activate'] as const)(
    'never bypasses staging in %s when verified bytes are unavailable',
    async (action) => {
      artifacts.acquire.mockResolvedValue({ digest, directory, path: join(directory, 'runtime.tar') });
      const remote = jest.spyOn(service as never, 'sudoRunScript');
      wago.createEnrollment.mockClear();
      if (action === 'deliver')
        await service.deliver(session.id, { confirmInstall: true, temporarySsh: credential }, principal);
      else
        await service.platform(
          session.id,
          'activate',
          { reviewedDockerActivation: true, temporarySsh: credential },
          principal,
        );
      expect(remote).not.toHaveBeenCalled();
      expect(wago.createEnrollment).not.toHaveBeenCalled();
      expect(
        (await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: session.id })).dockerProvisionToken,
      ).toBeNull();
      expect(existsSync(directory)).toBe(false);
    },
  );

  it.each(['deliver', 'activate'] as const)(
    'rejects a different verified artifact in %s before any remote calls',
    async (action) => {
      artifacts.acquire.mockResolvedValue({ digest: 'b'.repeat(64), bytes: 512, directory });
      const remote = jest.spyOn(service as never, 'sudoRunScript');
      wago.createEnrollment.mockClear();
      if (action === 'deliver')
        await service.deliver(session.id, { confirmInstall: true, temporarySsh: credential }, principal);
      else
        await expect(
          service.platform(
            session.id,
            'activate',
            { reviewedDockerActivation: true, temporarySsh: credential },
            principal,
          ),
        ).rejects.toThrow('session-pinned');
      expect(remote).not.toHaveBeenCalled();
      expect(wago.createEnrollment).not.toHaveBeenCalled();
      expect(existsSync(directory)).toBe(false);
    },
  );

  it('allows inactive Docker through staging, then activates before full hardware and capacity checks', async () => {
    let active = false;
    const order: string[] = [];
    wago.createEnrollment.mockClear();
    jest.spyOn(service as never, 'sudoRunScript').mockImplementation((async (
      _host,
      _pin,
      _credential,
      script: string,
    ) => {
      if (script === runtimeBundleStagingCapacityPreflightScript(512)) {
        expect(active).toBe(false);
        expect(script).not.toContain('docker info');
        order.push('staging');
      } else if (script.includes('runtime-version=0')) {
        expect(order).toEqual(['staging']);
        active = true;
        order.push('prepare');
      } else if (script === runtimeBundlePreflightScript(512)) {
        expect(active).toBe(true);
        expect(script).toContain('codesys-active');
        order.push('full');
      } else if (script.includes("printf 'epoch=")) {
        expect(order).toEqual(['staging', 'prepare', 'full']);
        return clockOutput();
      }
      return '';
    }) as never);
    jest.spyOn(service as never, 'copyTo').mockResolvedValue(undefined as never);
    const result = await service.deliver(session.id, { confirmInstall: true, temporarySsh: credential }, principal);
    expect(result.state).toBe('awaiting_discovery');
    expect(order).toEqual(['staging', 'prepare', 'full']);
    expect(artifacts.acquire).toHaveBeenCalledTimes(1);
    expect(wago.createEnrollment).toHaveBeenCalledTimes(1);
  });

  it('requires explicit destructive preparation approval', async () => {
    const remote = jest.spyOn(service as never, 'sudoRunScript');
    await expect(service.platform(session.id, 'activate', { temporarySsh: credential }, principal)).rejects.toThrow(
      'Explicit Docker',
    );
    expect(remote).not.toHaveBeenCalled();
  });

  it.each(['starting', 'recovering'])(
    'retains interrupted %s preparation for explicit cleanup after restart',
    async (state) => {
      const repository = db.getRepository(WagoCommissioningSession);
      await repository.update(session.id, { dockerProvisionToken: 'c'.repeat(32), dockerProvisionState: state });
      const remote = jest.spyOn(service as never, 'sudoRunScript');
      await service.onApplicationBootstrap();
      expect(await repository.findOneByOrFail({ id: session.id })).toMatchObject({
        dockerProvisionToken: 'c'.repeat(32),
        dockerProvisionState: 'recovery_required',
      });
      expect(remote).not.toHaveBeenCalled();
    },
  );

  it('fails closed before enrollment or delivery when active CODESYS cannot be disabled', async () => {
    jest.spyOn(service as never, 'inspect').mockResolvedValue({
      firmware: fw31IdentityOutput(),
      codesys: 'active',
    } as never);
    jest
      .spyOn(service as never, 'sudoRunScript')
      .mockResolvedValueOnce('' as never)
      .mockRejectedValue(
        new WagoCommissioningProcessError('ssh', 1, 1000, 'private remote output\ncodesys-disable-failed\n') as never,
      );
    const copy = jest.spyOn(service as never, 'copyTo');
    wago.createEnrollment.mockClear();
    const result = await service.deliver(session.id, { temporarySsh: credential, confirmInstall: true }, principal);
    expect(result).toMatchObject({
      state: 'delivery_failed',
      codesysState: 'active',
      dockerProvisionState: 'recovery_required',
    });
    expect(result.failureReason).toContain('config_runtime command failed to disable CODESYS permanently');
    expect(result.failureReason).not.toContain('private remote output');
    expect(wago.createEnrollment).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });

  it('retains an old restored token when final lifecycle reconciliation fails', async () => {
    const token = 'c'.repeat(32);
    await db.getRepository(WagoCommissioningSession).update(session.id, {
      dockerProvisionToken: token,
      dockerProvisionState: 'restored',
    });
    jest.spyOn(service as never, 'sudoRunScript').mockRejectedValue(new Error('unresolved-lifecycle-effects') as never);
    const result = await service.platform(
      session.id,
      'recover',
      {
        temporarySsh: credential,
        reviewedDockerActivation: true,
      },
      principal,
    );
    expect(result.dockerProvisionState).toBe('recovery_required');
    expect(result.failureReason).toContain('Cleaning up controller preparation');
    expect(
      (await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: session.id })).dockerProvisionToken,
    ).toBe(token);
  });

  it('pins the artifact and starts a fresh runtime transaction after cleaning a retained preparation', async () => {
    jest
      .spyOn(service as never, 'sudoRunScript')
      .mockImplementation((async (_host, _pin, _credential, script: string) =>
        script.includes("printf 'epoch=")
          ? `epoch=${Math.floor(Date.now() / 1000)}\nuptime=100.00\nboot=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\ntool=supported\n`
          : stoppedReport) as never);
    await service.platform(session.id, 'inspect', { temporarySsh: credential }, principal);
    await db.getRepository(WagoCommissioningSession).update(session.id, {
      dockerProvisionToken: 'c'.repeat(32),
      dockerProvisionState: 'started',
    });
    const copy = jest.spyOn(service as never, 'copyTo').mockResolvedValue(undefined as never);
    const delivered = await service.deliver(session.id, { confirmInstall: true, temporarySsh: credential }, principal);
    expect(delivered.state).toBe('awaiting_discovery');
    expect(artifacts.acquire).toHaveBeenCalledWith(digest);
    const script = copy.mock.calls[0][4] as string;
    const saved = await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: session.id });
    expect(saved.dockerProvisionToken).toBeNull();
    expect(script).toMatch(/[a-f0-9]{32}/);
    expect(script).toContain('WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-v1');
    expect(script).toContain('--user 10001:10001 --cap-drop ALL');
    expect(JSON.stringify(delivered)).not.toContain('bootstrap-fixture');
    expect((await service.list())[0]).not.toHaveProperty('deliveryToken');
    expect((await service.list())[0]).not.toHaveProperty('initiatingPrincipal');
  });

  it('uses factory credentials for platform inspection before enrollment', async () => {
    const remote = jest
      .spyOn(service as never, 'sudoRunScript')
      .mockImplementation((async (_host, _pin, _credential, script: string) =>
        script.includes("printf 'epoch=") ? clockOutput() : stoppedReport) as never);

    await service.platform(session.id, 'inspect', {}, principal);

    expect(remote).toHaveBeenCalledWith(
      session.targetHost,
      session.hostKeyFingerprint,
      { username: 'root', password: 'wago' },
      expect.any(String),
      { timeoutMs: 90_000, maxOutputBytes: 2048, readOnly: true },
    );
  });

  it('retries only preparation acknowledgement after runtime cleanup and preparation containment succeeded', async () => {
    const token = 'd'.repeat(32);
    const repository = db.getRepository(WagoCommissioningSession);
    await repository.update(session.id, {
      state: 'delivery_failed',
      deliveryToken: token,
      dockerProvisionToken: token,
      dockerProvisionState: 'started',
    });
    const remote = jest
      .spyOn(service as never, 'sudoRunScript')
      .mockResolvedValueOnce('' as never) // runtime cleanup
      .mockResolvedValueOnce('' as never) // runtime acknowledgement
      .mockResolvedValueOnce('' as never) // preparation containment
      .mockRejectedValueOnce(new Error('lost preparation acknowledgement') as never);
    const input = { confirmInstall: true, temporarySsh: credential };
    const failed = await service.recover(session.id, input, principal);
    expect(failed).toMatchObject({ state: 'recovery_revocation_pending', dockerProvisionState: 'restored' });
    expect((await repository.findOneByOrFail({ id: session.id })).dockerProvisionToken).toBe(token);
    remote.mockClear().mockResolvedValue('' as never);
    const result = await service.recover(session.id, input, principal);
    expect(remote).toHaveBeenCalledTimes(2); // runtime receipt acknowledgement + preparation finish only
    expect(result).toMatchObject({ state: 'delivery_failed', dockerProvisionState: null, failureReason: null });
    expect(result.runtimeRecoveryAvailable).toBeUndefined();
    expect((await repository.findOneByOrFail({ id: session.id })).dockerProvisionToken).toBeNull();
  });

  it('retains matching preparation ownership for cleanup when upload fails before a remote runtime journal exists', async () => {
    const repository = db.getRepository(WagoCommissioningSession);
    const remote = jest
      .spyOn(service as never, 'sudoRunScript')
      .mockImplementation((async (_host, _pin, _credential, script: string) =>
        script.includes("printf 'epoch=") ? clockOutput() : '') as never);
    jest.spyOn(service as never, 'copyTo').mockRejectedValue(new Error('connection failed before stdin') as never);
    const input = { confirmInstall: true, temporarySsh: credential };
    expect(await service.deliver(session.id, input, principal)).toMatchObject({
      state: 'delivery_failed',
      runtimeRecoveryAvailable: true,
    });
    const failed = await repository.findOneByOrFail({ id: session.id });
    expect(failed.deliveryToken).toBe(failed.dockerProvisionToken);
    expect(failed.deliveryToken).toMatch(/^[a-f0-9]{32}$/);
    remote.mockClear();
    const recovered = await service.recover(session.id, input, principal);
    expect(remote.mock.calls[0][3]).toContain('No preparation recovery ownership');
    expect(remote.mock.calls[0][3]).toContain(failed.deliveryToken);
    expect(recovered).toMatchObject({ state: 'delivery_failed', dockerProvisionState: null, failureReason: null });
    expect(recovered.runtimeRecoveryAvailable).toBeUndefined();
  });

  it('does not expose coordinator ownership state across service instances', async () => {
    const other = new WagoCommissioningService(context, wago as unknown as WagoService);
    other['sessions'] = db.getRepository(WagoCommissioningSession);
    expect(await service.operationStatus(session.id)).toEqual({ state: 'available' });
    expect(await other.operationStatus(session.id)).toEqual({ state: 'available' });
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
    expect(restored.progressStep).toBe('Runtime installation cleaned up');
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
    await db.getRepository(WagoController).save({
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
      await expect(new AddWagoCommissioningPrincipal1780000000009().down(runner)).rejects.toThrow(
        'Recover Docker provisioning',
      );
      expect(
        (await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: session.id })).dockerProvisionToken,
      ).toBe('c'.repeat(32));
    } finally {
      await runner.release();
    }
  });
});
