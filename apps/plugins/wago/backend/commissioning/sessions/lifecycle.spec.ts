import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { createHash, X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { fw31IdentityOutput } from '../../fixtures/fw31-identity';
import { controllerRow, sessionRow } from '../../rows.test-utils';
import { spyOnWagoStorage } from '../../storage-spy.test-utils';
import { createWagoTestStorage } from '../../storage/testing';
import { WagoCommissioningService } from '../service';
import { securityHarness, verifier } from '../harness.test-utils';
import { WagoRecoveryError } from '../../runtime/recovery-error';
import { runtimeBundleStagingCapacityPreflightScript } from '../../runtime/install';
import { WagoService } from '../../controllers/service';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

const secrets = {
  encrypt: jest.fn().mockReturnValue('opaque-ciphertext'),
  decrypt: jest.fn().mockReturnValue(verifier),
};

describe('WagoCommissioningService security and lifecycle', () => {
  it.each([undefined, false, 'true', 1])('requires literal installation consent (%p)', async (confirmInstall) => {
    const { service, inspect, sudo, wago } = await securityHarness();
    await expect(
      service.deliver(1, { confirmInstall, temporarySsh: { username: 'root', password: 'explicit' } } as never),
    ).rejects.toThrow('explicit installation confirmation');
    expect(inspect).not.toHaveBeenCalled();
    expect(sudo).not.toHaveBeenCalled();
    expect(wago.createEnrollment).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    {},
    { username: 'root' },
    { username: 'root', password: '' },
    { username: 'root', password: '   ' },
    { username: ' root', password: 'x' },
    { username: '-option', password: 'x' },
    { username: 'root@host', password: 'x' },
    { username: 12, password: 'x' },
    { username: 'root', password: 12 },
    { username: 'root', password: 'x\ninjected' },
    { username: 'root', password: 'x\0' },
  ])('rejects missing or invalid explicit credentials (%p)', async (temporarySsh) => {
    const { service, inspect, sudo } = await securityHarness();
    await expect(service.deliver(1, { confirmInstall: true, temporarySsh } as never)).rejects.toThrow(
      'explicit valid SSH',
    );
    expect(inspect).not.toHaveBeenCalled();
    expect(sudo).not.toHaveBeenCalled();
  });

  it('never resumes SSH at startup and makes interrupted sessions retryable', async () => {
    const { service, stored, wago, inspect } = await securityHarness({
      state: 'delivering',
      enrollmentId: 7,
    });
    await service.onApplicationBootstrap();
    expect(await stored()).toMatchObject({ state: 'delivery_failed', enrollmentId: null });
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(7, expect.any(Function));
    expect(inspect).not.toHaveBeenCalled();
    expect(wago.registerCommissioningDiscoveryHandler).toHaveBeenCalledTimes(1);
    await expect(service.deliver(1, { confirmInstall: true })).rejects.toThrow('explicit valid SSH');
  });

  it('does not require an enrolled controller lease just to read its saved state at startup', async () => {
    const { service } = await securityHarness({
      state: 'awaiting_verification',
      pairingCode: null,
      dockerProvisionState: 'started',
    });
    const lock = jest.fn().mockRejectedValue(new Error('Background check holds lease'));
    service['withControllerLock'] = lock;
    await expect(service['recoverSessions']()).resolves.toBeUndefined();
    expect(lock).not.toHaveBeenCalled();
  });

  it('revokes and clears legacy plaintext before registering discovery, using bounded pages', async () => {
    const { service, storage, spied, wago, context } = await securityHarness({
      id: 101,
      state: 'awaiting_discovery',
      enrollmentId: 7,
      pairingCode: 'legacy-secret',
    });
    await storage.tables.commissioningSessions.insertMany(
      Array.from({ length: 100 }, (_, i) =>
        sessionRow({
          id: i + 1,
          state: 'awaiting_discovery',
          enrollmentId: 7,
          pairingCode: 'legacy-secret',
          controllerName: 'Test',
        }),
      ),
    );
    wago.revokeEnrollmentById.mockImplementation(async () => {
      expect(wago.registerCommissioningDiscoveryHandler).not.toHaveBeenCalled();
    });
    await service.onApplicationBootstrap();
    expect(spied.commissioningSessions.find).toHaveBeenNthCalledWith(1, {
      orderBy: [{ field: 'id' }],
      limit: 100,
      offset: 0,
    });
    expect(spied.commissioningSessions.find).toHaveBeenNthCalledWith(2, {
      orderBy: [{ field: 'id' }],
      limit: 100,
      offset: 100,
    });
    const rows = await storage.tables.commissioningSessions.find();
    expect(rows).toHaveLength(101);
    expect(rows.every((entry) => entry.pairingCode === null && entry.state === 'revoked')).toBe(true);
    expect(wago.revokeEnrollmentById).toHaveBeenCalledTimes(101);
    expect(context.secrets.decrypt).not.toHaveBeenCalled();
    expect(wago.registerCommissioningDiscoveryHandler).toHaveBeenCalledTimes(1);
  });

  it.each(['broker', 'database', 'decrypt'])(
    'fails closed with safe errors during %s recovery failure',
    async (failure) => {
      const { service, stored, spied, wago, context } = await securityHarness({
        state: 'awaiting_discovery',
        enrollmentId: 7,
      });
      if (failure === 'database') spied.commissioningSessions.find.mockRejectedValue(new Error('unlabelled-secret'));
      else {
        if (failure === 'broker') await spied.commissioningSessions.update({ id: 1 }, { pairingCode: 'plaintext' });
        else
          context.secrets.decrypt.mockImplementation(() => {
            throw new Error('unlabelled-secret');
          });
        wago.revokeEnrollmentById.mockRejectedValue(new Error('unlabelled-secret'));
      }
      await service.onApplicationBootstrap();
      expect(wago.registerCommissioningDiscoveryHandler).not.toHaveBeenCalled();
      expect(JSON.stringify(context.logger.warn.mock.calls)).not.toContain('unlabelled-secret');
      if (failure !== 'database')
        expect(await stored()).toMatchObject({ pairingCode: null, state: 'revoked', enrollmentId: 7 });
    },
  );

  it('invalidates every plaintext verifier even when the first broker revocation fails', async () => {
    const { service, stored, storage, wago } = await securityHarness({ pairingCode: 'legacy', enrollmentId: 7 });
    await storage.tables.commissioningSessions.insert(
      sessionRow({ id: 2, enrollmentId: 8, pairingCode: 'legacy', state: 'awaiting_delivery' }),
    );
    wago.revokeEnrollmentById.mockRejectedValueOnce(new Error('broker unavailable'));
    await service.onApplicationBootstrap();
    expect(await stored(1)).toMatchObject({ state: 'revoked', pairingCode: null, enrollmentId: 7 });
    const later = await stored(2);
    expect(later).toMatchObject({ state: 'revoked', pairingCode: null, enrollmentId: null });
    expect(later?.progressStep).toBe('Commissioning session revoked');
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(8, expect.any(Function));
    expect(wago.registerCommissioningDiscoveryHandler).not.toHaveBeenCalled();
  });

  it('rejects a legacy verifier on direct discovery without passing it to claim', async () => {
    const { service, session, stored, wago } = await securityHarness({
      state: 'awaiting_discovery',
      enrollmentId: 7,
      pairingCode: 'plaintext',
    });
    await service.claimDiscovered({ id: 4, hardwareId: session.hardwareId, mqttServerId: 2, enrollmentId: 7 });
    expect(wago.claim).not.toHaveBeenCalled();
    expect((await stored())?.state).toBe('revoked');
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(7, expect.any(Function));
  });

  it('does not emit arbitrary broker claim errors', async () => {
    const { service, session, stored, wago } = await securityHarness({ state: 'awaiting_discovery', enrollmentId: 7 });
    wago.claim.mockRejectedValue(new Error('unlabelled-secret'));
    await service.claimDiscovered({ id: 4, hardwareId: session.hardwareId, mqttServerId: 2, enrollmentId: 7 });
    expect((await stored())?.failureReason).toBe('Automatic claim failed.');
  });

  it('reconciles a persisted claim after restart without revoking or reinstalling', async () => {
    const { service, session, stored, storage, wago, inspect } = await securityHarness({
      state: 'awaiting_claim',
      enrollmentId: 7,
    });
    await storage.tables.controllers.insert(
      controllerRow({
        hardwareId: session.hardwareId,
        mqttServerId: 2,
        enrollmentId: 7,
        trustState: 'claimed',
      }),
    );
    await service.onApplicationBootstrap();
    const reconciled = await stored();
    expect(reconciled?.state).toBe('claim_interrupted');
    expect(reconciled?.pairingCode).not.toBeNull();
    expect(wago.revokeEnrollmentById).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });

  it('replays saved early discovery after handler registration', async () => {
    const { service, session, stored, storage, wago } = await securityHarness({
      state: 'awaiting_discovery',
      enrollmentId: 7,
    });
    await storage.tables.controllers.insert(
      controllerRow({
        id: 4,
        hardwareId: session.hardwareId,
        mqttServerId: 2,
        enrollmentId: 7,
        trustState: 'untrusted',
      }),
    );
    await service['reconcileDiscovery']();
    expect(wago.claim).toHaveBeenCalledWith(4, 'Test', verifier, 2, expect.any(Function));
    expect((await stored())?.state).toBe('awaiting_verification');
  });

  it('queues early discovery until delivery finishes and does not report verified success', async () => {
    const { service, session, stored, wago, spied } = await securityHarness({ state: 'delivering', enrollmentId: 7 });
    let release!: () => void;
    const locked = service['withDeliveryLock'](
      1,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await Promise.resolve();
    const claim = service.claimDiscovered({ id: 4, hardwareId: session.hardwareId, mqttServerId: 2, enrollmentId: 7 });
    await Promise.resolve();
    expect(wago.claim).not.toHaveBeenCalled();
    expect(spied.commissioningSessions.findOne).toHaveBeenCalledWith({
      where: { hardwareId: session.hardwareId, mqttServerId: 2, enrollmentId: 7 },
    });
    await spied.commissioningSessions.update({ id: 1 }, { state: 'awaiting_discovery' });
    release();
    await locked;
    await claim;
    expect(wago.claim).toHaveBeenCalledTimes(1);
    expect((await stored())?.state).toBe('awaiting_verification');
  });

  it('reports crypto errors safely and never substitutes plaintext for encryption', async () => {
    const { service, context } = await securityHarness();
    context.secrets.encrypt.mockImplementation(() => {
      throw new Error('unlabelled-crypto-secret');
    });
    expect(() => service['encryptVerifier'](verifier)).toThrow('Commissioning verifier encryption failed.');
  });

  function configuredService() {
    // Runtime availability comes only from the verified server-owned catalog.
    const digest = createHash('sha256').update(Buffer.from('mock runtime bundle')).digest('hex');
    return class extends WagoCommissioningService {
      constructor(context: PluginContext, wago: WagoService) {
        super(context, wago, {
          has: async () => true,
          current: async () => ({ digest }),
          acquire: async () => ({
            directory: '/mock/staging',
            path: '/mock/staging/runtime.tar',
            bytes: 19,
            digest,
            image: `test.invalid/runtime@sha256:${'a'.repeat(64)}`,
          }),
        } as never);
      }
    };
  }

  it('rejects invalid artifacts before inspection, provisioning or revoking prior enrollment', async () => {
    const { service, stored, wago, inspect, sudo } = await securityHarness(
      { state: 'delivery_failed', enrollmentId: 7 },
      configuredService(),
    );
    service['acquireRuntimeBundle'] = jest.fn().mockRejectedValue(new Error('invalid build assets'));
    const result = await service.deliver(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'provided' },
    });
    expect((await stored())?.enrollmentId).toBe(7);
    expect(inspect).not.toHaveBeenCalled();
    expect(sudo).not.toHaveBeenCalled();
    expect(wago.createEnrollment).not.toHaveBeenCalled();
    expect(wago.revokeEnrollmentById).not.toHaveBeenCalled();
    expect(result.state).toBe('delivery_failed');
    expect(JSON.stringify(result)).not.toContain('provided');
  });

  it('blocks unavailable provisioning before SSH mutations', async () => {
    const { service, context, sudo, inspect, wago } = await securityHarness({}, configuredService());
    context.getMqttCredentialProvisioning().availableProviders.mockResolvedValue([]);
    const result = await service.deliver(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'provided' },
    });
    expect(result.state).toBe('delivery_failed');
    expect(inspect).not.toHaveBeenCalled();
    expect(sudo).not.toHaveBeenCalled();
    expect(wago.createEnrollment).not.toHaveBeenCalled();
  });

  it.each(['success', 'codesys', 'prerequisites', 'ca', 'plain', 'insecure'])(
    'delivery %s protects secrets and cleans verified artifacts',
    async (scenario) => {
      const fs = require('node:fs/promises') as typeof import('node:fs/promises');
      const bundle = Buffer.from('mock runtime bundle');
      const digest = createHash('sha256').update(bundle).digest('hex');
      jest.spyOn(fs, 'mkdtemp').mockResolvedValue('/mock/staging');
      jest.spyOn(fs, 'copyFile').mockResolvedValue(undefined);
      jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
      jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
      jest.spyOn(fs, 'stat').mockResolvedValue({ isFile: () => true } as never);
      jest.spyOn(fs, 'readFile').mockImplementation((async (path: string) => {
        if (path.endsWith('.sha256')) return `${digest}  runtime.tar\n`;
        if (path.endsWith('.pub')) return 'mock-public-key';
        return bundle;
      }) as never);
      try {
        const { service, stored, storage, spied, wago, inspect, sudo, context } = await securityHarness(
          { firmwareBaseline: '31', deliveryToken: null },
          configuredService(),
        );
        inspect.mockResolvedValue({
          firmware: fw31IdentityOutput(),
          codesys: scenario === 'codesys' ? 'active' : 'inactive',
        });
        const copy = jest.fn().mockResolvedValue(undefined);
        const install = jest
          .fn()
          .mockImplementation(async (_host, _pin, _credential, script: string) =>
            script.includes("printf 'epoch=")
              ? `epoch=${Math.floor(Date.now() / 1000)}\nuptime=100.00\nboot=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\ntool=supported\n`
              : '',
          );
        service['copyTo'] = copy;
        service['sudoRunScript'] = install;
        if (scenario === 'prerequisites') install.mockRejectedValue(new Error('private output'));
        let caCert: string | undefined;
        if (scenario === 'ca') {
          caCert = rootCertificates.find((pem) => {
            const certificate = new X509Certificate(pem);
            return (
              certificate.ca &&
              Date.parse(certificate.validFrom) < Date.now() &&
              Date.parse(certificate.validTo) > Date.now()
            );
          });
          expect(caCert).toBeDefined();
          context.getMqttServerConfig.mockResolvedValue({
            host: 'mock.invalid',
            port: 8883,
            useTls: true,
            caCert,
          } as never);
        }
        if (scenario === 'plain' || scenario === 'insecure')
          context.getMqttServerConfig.mockResolvedValue({
            host: 'mock.invalid',
            port: scenario === 'plain' ? 1883 : 8883,
            useTls: scenario === 'insecure',
            tlsInsecure: scenario === 'insecure',
          } as never);
        wago.createEnrollment.mockResolvedValue({
          id: 8,
          expiresAt: 'later',
          password: 'mqtt-password',
          username: 'enrollment',
          claimSecret: 'claim-secret',
          broker: { host: 'mock.invalid', port: 1883, useTls: false },
        });
        const persisted: string[] = [];
        spied.commissioningSessions.update.mockImplementation(async (where, patch, options) => {
          persisted.push(JSON.stringify(patch));
          return storage.tables.commissioningSessions.update(where, patch, options);
        });
        const result = await service.deliver(1, {
          confirmInstall: true,
          temporarySsh: { username: 'root', password: 'explicit-ssh' },
        });
        expect(fs.rm).toHaveBeenCalledWith('/mock/staging', { recursive: true, force: true });
        if (scenario === 'prerequisites') {
          expect(result.state).toBe('delivery_failed');
          expect(copy).not.toHaveBeenCalled();
          expect(wago.createEnrollment).not.toHaveBeenCalled();
          expect(sudo).not.toHaveBeenCalled();
          expect(result.failureReason).toContain('permanently disabled');
          expect(result.dockerProvisionState).toBeNull();
          expect((await stored())?.dockerProvisionToken).toBeFalsy();
          expect(install).toHaveBeenCalledTimes(1);
          expect(install.mock.calls[0][3]).toBe(runtimeBundleStagingCapacityPreflightScript(bundle.length));
          return;
        }
        expect(result.state).toBe('awaiting_discovery');
        expect(sudo).not.toHaveBeenCalled();
        expect(copy).toHaveBeenCalledTimes(1);
        expect(install).toHaveBeenCalledTimes(5);
        expect((await stored())?.codesysState).toBe('disabled');
        expect(install.mock.calls[0][3]).toBe(runtimeBundleStagingCapacityPreflightScript(bundle.length));
        expect(install.mock.calls[1][3]).toContain('runtime-version=0');
        expect(copy.mock.calls[0][4]).toContain('flock -n 9');
        expect(copy.mock.calls[0][4]).toContain(
          Buffer.from(
            [
              'WAGO_HARDWARE_ID=cc100-test',
              `WAGO_MQTT_URL=${scenario === 'plain' ? 'mqtt://mock.invalid:1883' : 'mqtts://mock.invalid:8883'}`,
              'WAGO_MQTT_USERNAME=enrollment',
              'WAGO_MQTT_PASSWORD=mqtt-password',
              'WAGO_ENROLLMENT_SECRET=claim-secret',
              `WAGO_PAIRING_CODE=${verifier}`,
              ...(scenario === 'insecure' ? ['WAGO_MQTT_TLS_INSECURE=true'] : []),
              ...(caCert ? ['NODE_EXTRA_CA_CERTS=/var/lib/attraccess-wago/mqtt-ca.pem'] : []),
            ].join('\n'),
          ).toString('base64'),
        );
        if (caCert) expect(copy.mock.calls[0][4]).toContain(Buffer.from(caCert).toString('base64'));
        expect((await stored())?.pairingCode).toBe('encrypted:v1:opaque-ciphertext');
        for (const value of persisted) {
          expect(value).not.toContain(verifier);
          expect(value).not.toMatch(/mqtt-password|claim-secret|explicit-ssh/);
        }
      } finally {
        jest.restoreAllMocks();
      }
    },
  );

  it.each([false, undefined])('requires recovery confirmation %p', async (confirmInstall) => {
    const { service, sudo } = await securityHarness({ state: 'delivery_failed' });
    await expect(
      service.recover(1, { confirmInstall, temporarySsh: { username: 'root', password: 'secret' } }),
    ).rejects.toThrow('explicit installation confirmation');
    expect(sudo).not.toHaveBeenCalled();
  });

  it('explicitly recovers without new artifacts, broker provisioning or acceptance', async () => {
    const { service, wago } = await securityHarness({ state: 'awaiting_verification', pairingCode: null });
    const script = jest.fn().mockResolvedValue('');
    service['sudoRunScript'] = script;
    const result = await service.recover(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'secret' },
    });
    expect(result.progressStep).toBe('Runtime installation cleaned up');
    expect(result.state).toBe('revoked');
    expect(result.progressDetail).toContain('new commissioning session');
    expect(script.mock.calls[0][3]).toContain('timeout -k 5 310 flock 9');
    expect(script.mock.calls[0][3]).not.toContain('touch "$tx/accepting"');
    expect(wago.createEnrollment).not.toHaveBeenCalled();
  });

  it('reports recovery failure safely and does not revoke credentials when remote recovery fails', async () => {
    const { service, wago } = await securityHarness({ state: 'delivery_failed', enrollmentId: 7 });
    service['sudoRunScript'] = jest.fn().mockRejectedValue(new Error('secret remote output'));
    const result = await service.recover(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'secret' },
    });
    expect(result.progressStep).toBe('Recovery requires attention');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(wago.revokeEnrollmentById).not.toHaveBeenCalled();
  });

  it('reports bounded lock contention as cleanup guidance instead of a credential failure', async () => {
    const { service, wago } = await securityHarness({ state: 'delivery_failed', enrollmentId: 7 });
    service['sudoRunScript'] = jest.fn().mockRejectedValue(new WagoRecoveryError('busy'));
    const result = await service.recover(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'secret' },
    });
    expect(result.failureReason).toContain('runtime monitor');
    expect(result.failureReason).toContain('310 seconds');
    expect(result.failureReason).toContain('Do not delete the lock file');
    expect(result.state).toBe('delivery_failed');
    expect(wago.revokeEnrollmentById).not.toHaveBeenCalled();
  });

  it('keeps interrupted claims blocked after failed recovery and requires a new session after restoration', async () => {
    const { service, stored } = await securityHarness({ state: 'claim_interrupted', enrollmentId: 7 });
    service['sudoRunScript'] = jest.fn().mockRejectedValueOnce(new Error('SSH unavailable')).mockResolvedValue('');
    const input = { confirmInstall: true, temporarySsh: { username: 'root', password: 'fixture' } };
    await service.recover(1, input);
    expect((await stored())?.state).toBe('claim_interrupted');
    await expect(service.deliver(1, input)).rejects.toThrow('cannot be delivered');
    await service.recover(1, input);
    expect(await stored()).toMatchObject({ state: 'revoked', pairingCode: null });
  });

  it('retries only revocation after restoration succeeds, including after restart', async () => {
    const { service, stored, wago } = await securityHarness({
      state: 'awaiting_verification',
      pairingCode: null,
      enrollmentId: 7,
    });
    const remote = jest.fn().mockResolvedValue('');
    service['sudoRunScript'] = remote;
    wago.revokeEnrollmentById.mockRejectedValueOnce(new Error('Broker unavailable')).mockResolvedValue(undefined);
    const input = { confirmInstall: true, temporarySsh: { username: 'root', password: 'fixture' } };
    await service.recover(1, input);
    expect((await stored())?.state).toBe('recovery_revocation_pending');
    await service.onApplicationBootstrap();
    expect((await stored())?.state).toBe('recovery_revocation_pending');
    await service.recover(1, input);
    expect(remote).toHaveBeenCalledTimes(3);
    expect(wago.revokeEnrollmentById).toHaveBeenCalledTimes(2);
    expect((await stored())?.state).toBe('revoked');
  });

  it('serializes different sessions for the same controller within this service process', async () => {
    const { service, storage } = await securityHarness({ hostKeyFingerprint: 'SHA256:controller' });
    await storage.tables.commissioningSessions.insert(sessionRow({ id: 2, hostKeyFingerprint: 'SHA256:controller' }));
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = service['withControllerLock'](1, () => pending);
    const secondWork = jest.fn();
    const second = service['withControllerLock'](2, secondWork);
    await new Promise((resolve) => setImmediate(resolve));
    expect(secondWork).not.toHaveBeenCalled();
    release();
    await Promise.all([first, second]);
    expect(secondWork).toHaveBeenCalledTimes(1);
  });

  /** A service over in-memory storage holding `rows`, with its session table opened as plugin start-up would. */
  async function standalone(rows: Record<string, unknown>[], wago: Record<string, unknown> = {}) {
    const storage = createWagoTestStorage();
    const spy = spyOnWagoStorage(storage);
    if (rows.length) await storage.tables.commissioningSessions.insertMany(rows.map((row) => sessionRow(row)));
    const context = { ...spy.context, secrets } as unknown as PluginContext;
    const gateway = { registerCommissioningDiscoveryHandler: jest.fn(), ...wago } as unknown as WagoService;
    const service = new WagoCommissioningService(context, gateway);
    service['sessions'] = spy.spied.commissioningSessions as never;
    return { service, storage, spied: spy.spied, wago: gateway };
  }

  it('defers opening the storage until plugin module initialization', async () => {
    const storage = createWagoTestStorage();
    const open = jest.spyOn(storage.storage, 'open');
    const context = { storage: storage.storage, persistence: storage.persistence } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);

    expect(open).not.toHaveBeenCalled();

    await service.onApplicationBootstrap();

    expect(open).toHaveBeenCalled();
  });

  it('serializes revocation with in-progress delivery work for the same session', async () => {
    const { service, storage, spied, wago } = await standalone(
      [{ id: 1, enrollmentId: 2, state: 'awaiting_identity_confirmation' }],
      { revokeEnrollmentById: jest.fn().mockResolvedValue(undefined) },
    );
    let releaseDelivery!: () => void;
    const delivery = new Promise<void>((resolve) => (releaseDelivery = resolve));

    const inProgressDelivery = service['withDeliveryLock'](1, () => delivery);
    await Promise.resolve();
    const revoke = service.revoke(1);
    await Promise.resolve();

    expect(wago.revokeEnrollmentById).not.toHaveBeenCalled();

    releaseDelivery();
    await inProgressDelivery;
    await revoke;

    expect(spied.commissioningSessions.get).toHaveBeenCalledWith(1);
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(2, expect.any(Function));
    expect((await storage.tables.commissioningSessions.get(1))?.state).toBe('revoked');
  });

  it('does not expose stored commissioning verifiers in session lists', async () => {
    const { service } = await standalone([
      {
        id: 1,
        controllerName: 'Boiler room',
        pairingCode: '482931',
        deliveryToken: 'delivery-secret',
        initiatingPrincipal: '{"userId":1}',
        dockerProvisionToken: 'docker-secret',
      },
    ]);

    const [listed] = await service.list();

    expect(listed).toMatchObject({ id: 1, controllerName: 'Boiler room', operationDeadlineAt: null });
    for (const secret of ['pairingCode', 'deliveryToken', 'initiatingPrincipal', 'dockerProvisionToken'])
      expect(listed).not.toHaveProperty(secret);
  });

  it('requires the administrator to confirm the scanned host key before delivery', async () => {
    const { service } = await standalone([
      {
        id: 1,
        hostKeyFingerprint: 'SHA256:test',
        state: 'awaiting_identity_confirmation',
        progressPercent: 0,
        progressStep: 'Confirm controller identity',
        progressDetail: '',
      },
    ]);

    await expect(service.confirmHostKey(1, 'SHA256:other')).rejects.toThrow('does not match');
    await expect(service.confirmHostKey(1, 'SHA256:test')).resolves.toMatchObject({
      state: 'awaiting_delivery',
      progressStep: 'Identity confirmed',
    });
  });

  it('rejects direct delivery before the scanned host key is confirmed', async () => {
    const { service } = await standalone([{ id: 1, state: 'awaiting_identity_confirmation' }]);

    await expect(service.deliver(1)).rejects.toThrow('cannot be delivered in its current state');
  });

  it('revokes and removes an enrollment session without retaining its records', async () => {
    const { service, storage, wago } = await standalone([{ id: 1, enrollmentId: 2 }], {
      revokeEnrollmentById: jest.fn().mockResolvedValue(undefined),
      deleteEnrollmentById: jest.fn().mockResolvedValue(undefined),
    });

    await service.remove(1);

    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(2, expect.any(Function));
    expect(wago.deleteEnrollmentById).toHaveBeenCalledWith(2, expect.any(Function));
    expect(await storage.tables.commissioningSessions.get(1)).toBeNull();
  });

  it('automatically claims each concurrent session only for its bound discovery', async () => {
    const first = {
      id: 1,
      hardwareId: 'cc100-01',
      mqttServerId: 2,
      enrollmentId: 3,
      controllerName: 'Boiler room',
      pairingCode: 'encrypted:v1:first',
      state: 'awaiting_discovery',
    };
    const second = {
      ...first,
      id: 2,
      hardwareId: 'cc100-02',
      enrollmentId: 4,
      controllerName: 'Pump room',
      pairingCode: 'encrypted:v1:second',
    };
    const registerCommissioningDiscoveryHandler = jest.fn();
    const { service, storage, wago } = await standalone([first, second], {
      registerCommissioningDiscoveryHandler,
      claim: jest.fn().mockResolvedValue(undefined),
    });
    await service.onApplicationBootstrap();

    const handler = registerCommissioningDiscoveryHandler.mock.calls[0][0] as (controller: {
      id: number;
      hardwareId: string;
      mqttServerId: number;
      enrollmentId: number;
    }) => Promise<void>;
    await Promise.all([
      handler({
        id: 9,
        hardwareId: first.hardwareId,
        mqttServerId: first.mqttServerId,
        enrollmentId: first.enrollmentId,
      }),
      handler({
        id: 10,
        hardwareId: second.hardwareId,
        mqttServerId: second.mqttServerId,
        enrollmentId: second.enrollmentId,
      }),
    ]);

    expect(wago.claim).toHaveBeenCalledWith(9, 'Boiler room', verifier, 2, expect.any(Function));
    expect(wago.claim).toHaveBeenCalledWith(10, 'Pump room', verifier, 2, expect.any(Function));
    const rows = await storage.tables.commissioningSessions.find({ orderBy: [{ field: 'id' }] });
    expect(rows.map((row) => row.state)).toEqual(['awaiting_verification', 'awaiting_verification']);
    expect(rows.map((row) => row.pairingCode)).toEqual([null, null]);
    expect(rows[0].auditLog).toContain('automatic_claim_completed');

    await handler({ id: 11, hardwareId: first.hardwareId, mqttServerId: 4, enrollmentId: 5 });
    expect(wago.claim).toHaveBeenCalledTimes(2);
  });
});
