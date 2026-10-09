import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { createHash, X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { fw31IdentityOutput } from '../../fixtures/fw31-identity';
import { WagoCommissioningSession } from './session.entity';
import { WagoCommissioningService } from '../service';
import { WagoController } from '../../controllers/entity';
import { WagoRecoveryError } from '../../runtime/recovery-error';
import { runtimeBundleStagingCapacityPreflightScript } from '../../runtime/install';
import { WagoService } from '../../controllers/service';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

const verifier = 'v'.repeat(43);

const secrets = {
  encrypt: jest.fn().mockReturnValue('opaque-ciphertext'),
  decrypt: jest.fn().mockReturnValue(verifier),
};

describe('WagoCommissioningService security and lifecycle', () => {
  function securityHarness(overrides: Partial<WagoCommissioningSession> = {}, Service = WagoCommissioningService) {
    const session = {
      id: 1,
      hardwareId: 'cc100-test',
      mqttServerId: 2,
      enrollmentId: null,
      pairingCode: 'encrypted:v1:opaque-ciphertext',
      deliveryToken: 'a'.repeat(32),
      state: 'awaiting_delivery',
      controllerName: 'Test',
      auditLog: '[]',
      ...overrides,
    } as WagoCommissioningSession;
    const repository = {
      find: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn().mockResolvedValue(session),
      save: jest.fn(async (value) => value),
    };
    const wago = {
      registerCommissioningDiscoveryHandler: jest.fn(),
      revokeEnrollmentById: jest.fn().mockResolvedValue(undefined),
      createEnrollment: jest.fn(),
      claim: jest.fn(),
    };
    const context = {
      getRepository: jest.fn().mockReturnValue(repository),
      getMqttServerConfig: jest.fn().mockResolvedValue({ host: 'mock.invalid', port: 8883, useTls: true }),
      getMqttCredentialProvisioning: jest
        .fn()
        .mockReturnValue({ availableProviders: jest.fn().mockResolvedValue([{ providerId: 'mock' }]) }),
      secrets: { encrypt: jest.fn().mockReturnValue('ciphertext'), decrypt: jest.fn().mockReturnValue(verifier) },
      logger: { warn: jest.fn() },
    };
    const service = new Service(context as unknown as PluginContext, wago as unknown as WagoService);
    service['sessions'] = repository as never;
    const inspect = jest.fn().mockRejectedValue(new Error('arbitrary-secret'));
    const sudo = jest.fn().mockResolvedValue('');
    service['inspect'] = inspect;
    service['sudoRun'] = sudo;
    return { service, session, repository, wago, context, inspect, sudo };
  }

  it.each([undefined, false, 'true', 1])('requires literal installation consent (%p)', async (confirmInstall) => {
    const { service, inspect, sudo, wago } = securityHarness();
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
    const { service, inspect, sudo } = securityHarness();
    await expect(service.deliver(1, { confirmInstall: true, temporarySsh } as never)).rejects.toThrow(
      'explicit valid SSH',
    );
    expect(inspect).not.toHaveBeenCalled();
    expect(sudo).not.toHaveBeenCalled();
  });

  it('never resumes SSH at startup and makes interrupted sessions retryable', async () => {
    const { service, session, repository, wago, inspect } = securityHarness({
      state: 'delivering',
      enrollmentId: 7,
    });
    repository.find.mockResolvedValue([session]);
    await service.onApplicationBootstrap();
    expect(session.state).toBe('delivery_failed');
    expect(session.enrollmentId).toBeNull();
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(7, expect.any(Function));
    expect(inspect).not.toHaveBeenCalled();
    expect(wago.registerCommissioningDiscoveryHandler).toHaveBeenCalledTimes(1);
    await expect(service.deliver(1, { confirmInstall: true })).rejects.toThrow('explicit valid SSH');
  });

  it('does not require an enrolled controller lease just to read its saved state at startup', async () => {
    const { service, session, repository } = securityHarness({
      state: 'awaiting_verification',
      pairingCode: null,
      dockerProvisionState: 'started',
    });
    repository.find.mockResolvedValue([session]);
    const lock = jest.fn().mockRejectedValue(new Error('Background check holds lease'));
    service['withControllerLock'] = lock;
    await expect(service['recoverSessions']()).resolves.toBeUndefined();
    expect(lock).not.toHaveBeenCalled();
  });

  it('revokes and clears legacy plaintext before registering discovery, using bounded pages', async () => {
    const { service, session, repository, wago, context } = securityHarness({
      id: 101,
      state: 'awaiting_discovery',
      enrollmentId: 7,
      pairingCode: 'legacy-secret',
    });
    const firstPage = Array.from({ length: 100 }, (_, i) => ({ ...session, id: i + 1 }));
    repository.findOneBy.mockImplementation(async ({ id }) =>
      id === session.id ? session : firstPage.find((entry) => entry.id === id),
    );
    repository.find.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([session]);
    wago.revokeEnrollmentById.mockImplementation(async () => {
      expect(wago.registerCommissioningDiscoveryHandler).not.toHaveBeenCalled();
    });
    await service.onApplicationBootstrap();
    expect(repository.find).toHaveBeenNthCalledWith(1, { order: { id: 'ASC' }, take: 100, skip: 0 });
    expect(repository.find).toHaveBeenNthCalledWith(2, { order: { id: 'ASC' }, take: 100, skip: 100 });
    expect(session.state).toBe('revoked');
    expect(session.pairingCode).toBeNull();
    expect(firstPage.every((entry) => entry.pairingCode === null && entry.state === 'revoked')).toBe(true);
    expect(wago.revokeEnrollmentById).toHaveBeenCalledTimes(101);
    expect(context.secrets.decrypt).not.toHaveBeenCalled();
    expect(wago.registerCommissioningDiscoveryHandler).toHaveBeenCalledTimes(1);
  });

  it.each(['broker', 'database', 'decrypt'])(
    'fails closed with safe errors during %s recovery failure',
    async (failure) => {
      const { service, session, repository, wago, context } = securityHarness({
        state: 'awaiting_discovery',
        enrollmentId: 7,
      });
      repository.find.mockResolvedValue([session]);
      if (failure === 'database') repository.find.mockRejectedValue(new Error('unlabelled-secret'));
      else {
        if (failure === 'broker') session.pairingCode = 'plaintext';
        else
          context.secrets.decrypt.mockImplementation(() => {
            throw new Error('unlabelled-secret');
          });
        wago.revokeEnrollmentById.mockRejectedValue(new Error('unlabelled-secret'));
      }
      await service.onApplicationBootstrap();
      expect(wago.registerCommissioningDiscoveryHandler).not.toHaveBeenCalled();
      expect(JSON.stringify(context.logger.warn.mock.calls)).not.toContain('unlabelled-secret');
      if (failure !== 'database') {
        expect(session.pairingCode).toBeNull();
        expect(session.state).toBe('revoked');
        expect(session.enrollmentId).toBe(7);
      }
    },
  );

  it('invalidates every plaintext verifier even when the first broker revocation fails', async () => {
    const { service, session, repository, wago } = securityHarness({ pairingCode: 'legacy', enrollmentId: 7 });
    const later = { ...session, id: 2, enrollmentId: 8 };
    repository.find.mockResolvedValue([session, later]);
    repository.findOneBy.mockImplementation(async ({ id }) => (id === later.id ? later : session));
    wago.revokeEnrollmentById.mockRejectedValueOnce(new Error('broker unavailable'));
    await service.onApplicationBootstrap();
    expect(session).toMatchObject({ state: 'revoked', pairingCode: null, enrollmentId: 7 });
    expect(later).toMatchObject({ state: 'revoked', pairingCode: null, enrollmentId: null });
    expect(later.progressStep).toBe('Commissioning session revoked');
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(8, expect.any(Function));
    expect(wago.registerCommissioningDiscoveryHandler).not.toHaveBeenCalled();
  });

  it('rejects a legacy verifier on direct discovery without passing it to claim', async () => {
    const { service, session, wago } = securityHarness({
      state: 'awaiting_discovery',
      enrollmentId: 7,
      pairingCode: 'plaintext',
    });
    await service.claimDiscovered({ id: 4, hardwareId: session.hardwareId, mqttServerId: 2, enrollmentId: 7 });
    expect(wago.claim).not.toHaveBeenCalled();
    expect(session.state).toBe('revoked');
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(7, expect.any(Function));
  });

  it('does not emit arbitrary broker claim errors', async () => {
    const { service, session, wago } = securityHarness({ state: 'awaiting_discovery', enrollmentId: 7 });
    wago.claim.mockRejectedValue(new Error('unlabelled-secret'));
    await service.claimDiscovered({ id: 4, hardwareId: session.hardwareId, mqttServerId: 2, enrollmentId: 7 });
    expect(session.failureReason).toBe('Automatic claim failed.');
  });

  it('reconciles a persisted claim after restart without revoking or reinstalling', async () => {
    const { service, session, repository, context, wago, inspect } = securityHarness({
      state: 'awaiting_claim',
      enrollmentId: 7,
    });
    repository.find.mockResolvedValue([session]);
    context.getRepository.mockImplementation((entity) =>
      entity === WagoController ? { findOneBy: jest.fn().mockResolvedValue({ trustState: 'claimed' }) } : repository,
    );
    await service.onApplicationBootstrap();
    expect(session.state).toBe('claim_interrupted');
    expect(session.pairingCode).not.toBeNull();
    expect(wago.revokeEnrollmentById).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });

  it('replays saved early discovery after handler registration', async () => {
    const { service, session, repository, context, wago } = securityHarness({
      state: 'awaiting_discovery',
      enrollmentId: 7,
    });
    repository.find.mockResolvedValue([session]);
    context.getRepository.mockImplementation((entity) =>
      entity === WagoController
        ? {
            findOneBy: jest.fn().mockResolvedValue({
              id: 4,
              hardwareId: session.hardwareId,
              mqttServerId: 2,
              enrollmentId: 7,
              trustState: 'untrusted',
            }),
          }
        : repository,
    );
    await service['reconcileDiscovery']();
    expect(wago.claim).toHaveBeenCalledWith(4, 'Test', verifier, 2, expect.any(Function));
    expect(session.state).toBe('awaiting_verification');
  });

  it('queues early discovery until delivery finishes and does not report verified success', async () => {
    const { service, session, wago, repository } = securityHarness({ state: 'delivering', enrollmentId: 7 });
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
    expect(repository.findOneBy).toHaveBeenCalledWith({
      hardwareId: session.hardwareId,
      mqttServerId: 2,
      enrollmentId: 7,
    });
    session.state = 'awaiting_discovery';
    release();
    await locked;
    await claim;
    expect(wago.claim).toHaveBeenCalledTimes(1);
    expect(session.state).toBe('awaiting_verification');
  });

  it('reports crypto errors safely and never substitutes plaintext for encryption', () => {
    const { service, context } = securityHarness();
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
    const { service, session, wago, inspect, sudo } = securityHarness(
      { state: 'delivery_failed', enrollmentId: 7 },
      configuredService(),
    );
    service['acquireRuntimeBundle'] = jest.fn().mockRejectedValue(new Error('invalid build assets'));
    const result = await service.deliver(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'provided' },
    });
    expect(session.enrollmentId).toBe(7);
    expect(inspect).not.toHaveBeenCalled();
    expect(sudo).not.toHaveBeenCalled();
    expect(wago.createEnrollment).not.toHaveBeenCalled();
    expect(wago.revokeEnrollmentById).not.toHaveBeenCalled();
    expect(result.state).toBe('delivery_failed');
    expect(JSON.stringify(result)).not.toContain('provided');
  });

  it('blocks unavailable provisioning before SSH mutations', async () => {
    const { service, context, sudo, inspect, wago } = securityHarness({}, configuredService());
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
        const { service, session, repository, wago, inspect, sudo, context } = securityHarness(
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
        repository.save.mockImplementation(async (value) => {
          persisted.push(JSON.stringify(value));
          return value;
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
          expect(result.dockerProvisionState).toBeUndefined();
          expect(session.dockerProvisionToken).toBeFalsy();
          expect(install).toHaveBeenCalledTimes(1);
          expect(install.mock.calls[0][3]).toBe(runtimeBundleStagingCapacityPreflightScript(bundle.length));
          return;
        }
        expect(result.state).toBe('awaiting_discovery');
        expect(sudo).not.toHaveBeenCalled();
        expect(copy).toHaveBeenCalledTimes(1);
        expect(install).toHaveBeenCalledTimes(5);
        expect(session.codesysState).toBe('disabled');
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
        expect(session.pairingCode).toBe('encrypted:v1:opaque-ciphertext');
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
    const { service, sudo } = securityHarness({ state: 'delivery_failed' });
    await expect(
      service.recover(1, { confirmInstall, temporarySsh: { username: 'root', password: 'secret' } }),
    ).rejects.toThrow('explicit installation confirmation');
    expect(sudo).not.toHaveBeenCalled();
  });

  it('explicitly recovers without new artifacts, broker provisioning or acceptance', async () => {
    const { service, wago } = securityHarness({ state: 'awaiting_verification', pairingCode: null });
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
    const { service, wago } = securityHarness({ state: 'delivery_failed', enrollmentId: 7 });
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
    const { service, wago } = securityHarness({ state: 'delivery_failed', enrollmentId: 7 });
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
    const { service, session } = securityHarness({ state: 'claim_interrupted', enrollmentId: 7 });
    service['sudoRunScript'] = jest.fn().mockRejectedValueOnce(new Error('SSH unavailable')).mockResolvedValue('');
    const input = { confirmInstall: true, temporarySsh: { username: 'root', password: 'fixture' } };
    await service.recover(1, input);
    expect(session.state).toBe('claim_interrupted');
    await expect(service.deliver(1, input)).rejects.toThrow('cannot be delivered');
    await service.recover(1, input);
    expect(session.state).toBe('revoked');
    expect(session.pairingCode).toBeNull();
  });

  it('retries only revocation after restoration succeeds, including after restart', async () => {
    const { service, session, repository, wago } = securityHarness({
      state: 'awaiting_verification',
      pairingCode: null,
      enrollmentId: 7,
    });
    const remote = jest.fn().mockResolvedValue('');
    service['sudoRunScript'] = remote;
    wago.revokeEnrollmentById.mockRejectedValueOnce(new Error('Broker unavailable')).mockResolvedValue(undefined);
    const input = { confirmInstall: true, temporarySsh: { username: 'root', password: 'fixture' } };
    await service.recover(1, input);
    expect(session.state).toBe('recovery_revocation_pending');
    repository.find.mockResolvedValue([session]);
    await service.onApplicationBootstrap();
    expect(session.state).toBe('recovery_revocation_pending');
    await service.recover(1, input);
    expect(remote).toHaveBeenCalledTimes(3);
    expect(wago.revokeEnrollmentById).toHaveBeenCalledTimes(2);
    expect(session.state).toBe('revoked');
  });

  it('serializes different sessions for the same controller within this service process', async () => {
    const { service, repository, session } = securityHarness({ hostKeyFingerprint: 'SHA256:controller' });
    repository.findOneBy.mockImplementation(async ({ id }) => ({ ...session, id }));
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

  {
    it('defers repository access until plugin module initialization', async () => {
      const repository = { find: jest.fn().mockResolvedValue([]) };
      const context = {
        getRepository: jest.fn().mockReturnValue(repository),
      } as unknown as PluginContext;

      const service = new WagoCommissioningService(context, {
        registerCommissioningDiscoveryHandler: jest.fn(),
      } as unknown as WagoService);

      expect(context.getRepository).not.toHaveBeenCalled();

      await service.onApplicationBootstrap();

      expect(context.getRepository).toHaveBeenCalledWith(WagoCommissioningSession);
    });
  }

  {
    it('serializes revocation with in-progress delivery work for the same session', async () => {
      const session = {
        id: 1,
        enrollmentId: 2,
        state: 'awaiting_identity_confirmation',
        failureReason: null,
        auditLog: '[]',
        updatedAt: '',
      } as WagoCommissioningSession;
      const repository = {
        findOneBy: jest.fn().mockResolvedValue(session),
        save: jest.fn().mockImplementation(async (value) => value),
      };
      const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
      let releaseDelivery!: () => void;
      const delivery = new Promise<void>((resolve) => (releaseDelivery = resolve));
      const wago = { revokeEnrollmentById: jest.fn().mockResolvedValue(undefined) } as unknown as WagoService;
      const service = new WagoCommissioningService(context, {
        ...wago,
        registerCommissioningDiscoveryHandler: jest.fn(),
      } as unknown as WagoService);
      service.onApplicationBootstrap();

      const inProgressDelivery = service['withDeliveryLock'](session.id, () => delivery);
      await Promise.resolve();
      const revoke = service.revoke(session.id);
      await Promise.resolve();

      expect(wago.revokeEnrollmentById).not.toHaveBeenCalled();

      releaseDelivery();
      await inProgressDelivery;
      await revoke;

      expect(repository.findOneBy).toHaveBeenCalledWith({ id: session.id });
      expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(2, expect.any(Function));
      expect(session.state).toBe('revoked');
    });
  }

  {
    it('does not expose stored commissioning verifiers in session lists', async () => {
      const repository = {
        find: jest
          .fn()
          .mockResolvedValue([
            { id: 1, controllerName: 'Boiler room', pairingCode: '482931' } as WagoCommissioningSession,
          ]),
      };
      const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
      const service = new WagoCommissioningService(context, {
        registerCommissioningDiscoveryHandler: jest.fn(),
      } as unknown as WagoService);
      service['sessions'] = repository as never;

      const [listed] = await service.list();

      expect(listed).toEqual({ id: 1, controllerName: 'Boiler room', operationDeadlineAt: null });
      expect(listed).not.toHaveProperty('pairingCode');
    });
  }

  {
    it('requires the administrator to confirm the scanned host key before delivery', async () => {
      const session = {
        id: 1,
        hostKeyFingerprint: 'SHA256:test',
        state: 'awaiting_identity_confirmation',
        progressPercent: 0,
        progressStep: 'Confirm controller identity',
        progressDetail: '',
        auditLog: '[]',
        updatedAt: '',
      } as WagoCommissioningSession;
      const repository = {
        findOneBy: jest.fn().mockResolvedValue(session),
        save: jest.fn().mockImplementation(async (value) => value),
      };
      const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
      const service = new WagoCommissioningService(context, {
        registerCommissioningDiscoveryHandler: jest.fn(),
      } as unknown as WagoService);
      service.onApplicationBootstrap();

      await expect(service.confirmHostKey(session.id, 'SHA256:other')).rejects.toThrow('does not match');
      await expect(service.confirmHostKey(session.id, session.hostKeyFingerprint)).resolves.toMatchObject({
        state: 'awaiting_delivery',
        progressStep: 'Identity confirmed',
      });
    });
  }

  {
    it('rejects direct delivery before the scanned host key is confirmed', async () => {
      const session = { id: 1, state: 'awaiting_identity_confirmation' } as WagoCommissioningSession;
      const repository = { findOneBy: jest.fn().mockResolvedValue(session) };
      const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
      const service = new WagoCommissioningService(context, {
        registerCommissioningDiscoveryHandler: jest.fn(),
      } as unknown as WagoService);
      service.onApplicationBootstrap();

      await expect(service.deliver(session.id)).rejects.toThrow('cannot be delivered in its current state');
    });
  }

  {
    it('revokes and removes an enrollment session without retaining its records', async () => {
      const session = { id: 1, enrollmentId: 2 } as WagoCommissioningSession;
      const repository = {
        findOneBy: jest.fn().mockResolvedValue(session),
        delete: jest.fn(),
      };
      const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
      const wago = {
        registerCommissioningDiscoveryHandler: jest.fn(),
        revokeEnrollmentById: jest.fn().mockResolvedValue(undefined),
        deleteEnrollmentById: jest.fn().mockResolvedValue(undefined),
      } as unknown as WagoService;
      const service = new WagoCommissioningService(context, wago);
      service.onApplicationBootstrap();

      await service.remove(session.id);

      expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(session.enrollmentId, expect.any(Function));
      expect(wago.deleteEnrollmentById).toHaveBeenCalledWith(session.enrollmentId, expect.any(Function));
      expect(repository.delete).toHaveBeenCalledWith(session.id);
    });
  }

  it('automatically claims each concurrent session only for its bound discovery', async () => {
    const first = {
      id: 1,
      hardwareId: 'cc100-01',
      mqttServerId: 2,
      enrollmentId: 3,
      controllerName: 'Boiler room',
      pairingCode: 'encrypted:v1:first',
      state: 'awaiting_discovery',
      failureReason: null,
      auditLog: '[]',
      updatedAt: '',
    } as WagoCommissioningSession;
    const second = {
      ...first,
      id: 2,
      hardwareId: 'cc100-02',
      enrollmentId: 4,
      controllerName: 'Pump room',
      pairingCode: 'encrypted:v1:second',
    };
    const sessions = [first, second];
    const repository = {
      find: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn().mockImplementation(async (where) => {
        if ('id' in where) return sessions.find((session) => session.id === where.id) ?? null;
        return (
          sessions.find(
            (session) =>
              session.hardwareId === where.hardwareId &&
              session.mqttServerId === where.mqttServerId &&
              session.enrollmentId === where.enrollmentId,
          ) ?? null
        );
      }),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const registerCommissioningDiscoveryHandler = jest.fn();
    const wago = {
      registerCommissioningDiscoveryHandler,
      claim: jest.fn().mockResolvedValue(undefined),
    } as unknown as WagoService;
    const context = {
      getRepository: jest.fn().mockReturnValue(repository),
      secrets: secrets,
    } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, wago);
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
    expect(first.state).toBe('awaiting_verification');
    expect(second.state).toBe('awaiting_verification');
    expect(first.pairingCode).toBeNull();
    expect(second.pairingCode).toBeNull();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ auditLog: expect.stringContaining('automatic_claim_completed') }),
    );

    await handler({ id: 11, hardwareId: first.hardwareId, mqttServerId: 4, enrollmentId: 5 });
    expect(wago.claim).toHaveBeenCalledTimes(2);
  });
});
