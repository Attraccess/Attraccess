import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import {
  isSupportedController,
  resolveRuntimeSigningPublicKeyPath,
  runtimeBundleInstallScript,
  WagoCommissioningService,
} from './wago-commissioning.service';
import { WagoService } from './wago.service';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
const verifier = 'v'.repeat(43);
const secrets = {
  encrypt: jest.fn().mockReturnValue('opaque-ciphertext'),
  decrypt: jest.fn().mockReturnValue(verifier),
};

describe('WagoCommissioningService', () => {
  function securityHarness(overrides: Partial<WagoCommissioningSession> = {}, Service = WagoCommissioningService) {
    const session = {
      id: 1,
      hardwareId: 'cc100-test',
      mqttServerId: 2,
      enrollmentId: null,
      pairingCode: 'encrypted:v1:opaque-ciphertext',
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
      deleteEnrollmentById: jest.fn().mockResolvedValue(undefined),
      createEnrollment: jest.fn(),
      claim: jest.fn(),
    };
    const context = {
      getRepository: jest.fn().mockReturnValue(repository),
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
    const { service, session, repository, wago, inspect } = securityHarness({ state: 'delivering', enrollmentId: 7 });
    repository.find.mockResolvedValue([session]);
    await service.onApplicationBootstrap();
    expect(session.state).toBe('delivery_failed');
    expect(session.enrollmentId).toBeNull();
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(7);
    expect(inspect).not.toHaveBeenCalled();
    expect(wago.registerCommissioningDiscoveryHandler).toHaveBeenCalledTimes(1);
    await expect(service.deliver(1, { confirmInstall: true })).rejects.toThrow('explicit valid SSH');
  });

  it('revokes and clears legacy plaintext before registering discovery, using bounded pages', async () => {
    const { service, session, repository, wago, context } = securityHarness({
      state: 'awaiting_discovery',
      enrollmentId: 7,
      pairingCode: 'legacy-secret',
    });
    repository.find
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => ({ ...session, id: i + 1 })))
      .mockResolvedValueOnce([session]);
    wago.revokeEnrollmentById.mockImplementation(async () => {
      expect(wago.registerCommissioningDiscoveryHandler).not.toHaveBeenCalled();
    });
    await service.onApplicationBootstrap();
    expect(repository.find).toHaveBeenNthCalledWith(1, { order: { id: 'ASC' }, take: 100, skip: 0 });
    expect(repository.find).toHaveBeenNthCalledWith(2, { order: { id: 'ASC' }, take: 100, skip: 100 });
    expect(session.state).toBe('revoked');
    expect(session.pairingCode).toBeNull();
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
    wago.revokeEnrollmentById.mockRejectedValueOnce(new Error('broker unavailable'));
    await service.onApplicationBootstrap();
    expect(session).toMatchObject({ state: 'revoked', pairingCode: null, enrollmentId: 7 });
    expect(later).toMatchObject({ state: 'revoked', pairingCode: null, enrollmentId: null });
    expect(later.progressStep).toBe('Commissioning session revoked');
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(8);
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
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(7);
  });

  it('does not emit arbitrary broker claim errors', async () => {
    const { service, session, wago } = securityHarness({ state: 'awaiting_discovery', enrollmentId: 7 });
    wago.claim.mockRejectedValue(new Error('unlabelled-secret'));
    await service.claimDiscovered({ id: 4, hardwareId: session.hardwareId, mqttServerId: 2, enrollmentId: 7 });
    expect(session.failureReason).toBe('Automatic claim failed.');
  });

  it.each(['stderr', 'error'])('does not expose subprocess %s during host-key scanning', async (failure) => {
    jest.mocked(spawn).mockImplementation((() => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: Object.assign(new EventEmitter(), { end: jest.fn() }),
        kill: jest.fn(),
      });
      queueMicrotask(() => {
        if (failure === 'error') child.emit('error', new Error('unlabelled-process-secret'));
        else child.stderr.emit('data', 'unlabelled-process-secret');
        child.emit('close', 1);
      });
      return child;
    }) as never);
    const context = { getMqttServerConfig: jest.fn().mockResolvedValue({}) } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {} as WagoService);
    await expect(service.create({ mqttServerId: 2, targetHost: '10.0.0.1', name: 'Mock' })).rejects.toThrow(
      'Commissioning SSH host-key scan failed.',
    );
  });

  it('reports crypto errors safely and never substitutes plaintext for encryption', () => {
    const { service, context } = securityHarness();
    context.secrets.encrypt.mockImplementation(() => {
      throw new Error('unlabelled-crypto-secret');
    });
    expect(() => service['encryptVerifier'](verifier)).toThrow('Commissioning verifier encryption failed.');
  });

  function configuredService() {
    const configuration = {
      WAGO_CC100_RUNTIME_IMAGE: `test.invalid/runtime@sha256:${'a'.repeat(64)}`,
      WAGO_CC100_RUNTIME_BUNDLE_PATH: '/mock/runtime.tar',
      WAGO_CC100_RUNTIME_BUNDLE_SHA256_PATH: '/mock/runtime.tar.sha256',
      WAGO_CC100_RUNTIME_BUNDLE_SIGNATURE_PATH: '/mock/runtime.tar.sig',
    };
    const previous = Object.fromEntries(Object.keys(configuration).map((key) => [key, process.env[key]]));
    let Service = WagoCommissioningService;
    try {
      Object.assign(process.env, configuration);
      jest.isolateModules(() => {
        Service = (require('./wago-commissioning.service') as typeof import('./wago-commissioning.service'))
          .WagoCommissioningService;
        jest
          .mocked((require('node:child_process') as typeof import('node:child_process')).spawn)
          .mockImplementation((() => {
            const child = Object.assign(new EventEmitter(), {
              stdout: new EventEmitter(),
              stderr: new EventEmitter(),
              stdin: Object.assign(new EventEmitter(), { end: jest.fn() }),
              kill: jest.fn(),
            });
            queueMicrotask(() => child.emit('close', 0));
            return child;
          }) as never);
      });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    return Service;
  }

  it('revokes an old enrollment before retry inspection and never exposes SSH errors', async () => {
    const { service, session, wago, inspect } = securityHarness(
      { state: 'delivery_failed', enrollmentId: 7 },
      configuredService(),
    );
    inspect.mockImplementation(async () => {
      expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(7);
      expect(session.enrollmentId).toBeNull();
      throw new Error('arbitrary-SSH-secret');
    });
    const result = await service.deliver(1, {
      confirmInstall: true,
      temporarySsh: { username: 'operator', password: 'provided-password' },
    });
    expect(inspect).toHaveBeenCalledWith(undefined, undefined, { username: 'operator', password: 'provided-password' });
    expect(result.state).toBe('delivery_failed');
    expect(JSON.stringify(result)).not.toMatch(/arbitrary-SSH-secret|provided-password/);
    expect(wago.createEnrollment).not.toHaveBeenCalled();
    await expect(service.deliver(1, { confirmInstall: true })).rejects.toThrow('explicit valid SSH');
    await expect(
      service.deliver(1, { temporarySsh: { username: 'operator', password: 'provided-password' } }),
    ).rejects.toThrow('explicit installation confirmation');
  });

  it('blocks replacement when old enrollment revocation fails and retains its ID', async () => {
    const { service, session, wago, inspect, sudo } = securityHarness(
      { state: 'delivery_failed', enrollmentId: 7 },
      configuredService(),
    );
    wago.revokeEnrollmentById.mockRejectedValue(new Error('arbitrary-broker-secret'));
    const result = await service.deliver(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'provided' },
    });
    expect(session.enrollmentId).toBe(7);
    expect(inspect).not.toHaveBeenCalled();
    expect(sudo).not.toHaveBeenCalled();
    expect(wago.createEnrollment).not.toHaveBeenCalled();
    expect(result.failureReason).toBe('Secure delivery failed; bootstrap credential revocation requires attention.');
  });

  it('retains an enrollment reference when its revoked record cannot be deleted', async () => {
    const { service, session, wago } = securityHarness({ enrollmentId: 7 });
    wago.deleteEnrollmentById.mockRejectedValue(new Error('database unavailable'));

    await expect(service['revokeSessionEnrollment'](session)).rejects.toThrow(
      'Commissioning credential revocation requires attention.',
    );

    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(7);
    expect(wago.deleteEnrollmentById).toHaveBeenCalledWith(7);
    expect(session.enrollmentId).toBe(7);
  });

  it('continues superseded-session cleanup after revocation failures across pages and hardware groups', async () => {
    const firstCompleted = { id: 1, hardwareId: 'cc100-first', state: 'completed' } as WagoCommissioningSession;
    const secondCompleted = { id: 2, hardwareId: 'cc100-second', state: 'completed' } as WagoCommissioningSession;
    const firstSuperseded = {
      id: 3,
      hardwareId: firstCompleted.hardwareId,
      enrollmentId: 30,
      state: 'awaiting_delivery',
      pairingCode: 'encrypted:v1:one',
      auditLog: '[]',
    } as WagoCommissioningSession;
    const secondSuperseded = {
      id: 4,
      hardwareId: secondCompleted.hardwareId,
      enrollmentId: 40,
      state: 'awaiting_delivery',
      pairingCode: 'encrypted:v1:two',
      auditLog: '[]',
    } as WagoCommissioningSession;
    const repository = {
      find: jest.fn().mockImplementation(async ({ where, skip }: { where: { state?: string; hardwareId?: string }; skip: number }) => {
        if (where.state === 'completed') return skip === 0 ? [firstCompleted, secondCompleted] : [];
        if (where.hardwareId === firstCompleted.hardwareId) return skip === 0 ? [firstCompleted, firstSuperseded] : [];
        return skip === 0 ? [secondCompleted, secondSuperseded] : [];
      }),
      findOneBy: jest.fn().mockImplementation(async ({ id }) =>
        [firstSuperseded, secondSuperseded].find((session) => session.id === id) ?? null,
      ),
      save: jest.fn(async (value) => value),
    };
    const wago = {
      revokeEnrollmentById: jest.fn().mockImplementation(async (id) => {
        if (id === firstSuperseded.enrollmentId) throw new Error('broker unavailable');
      }),
      deleteEnrollmentById: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WagoCommissioningService(
      { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext,
      wago as unknown as WagoService,
    );
    service['sessions'] = repository as never;

    await expect(service['reconcileCompletedSessions']()).rejects.toThrow(
      'Superseded commissioning credential cleanup requires attention.',
    );

    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(30);
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(40);
    expect(secondSuperseded).toMatchObject({ state: 'revoked', enrollmentId: null, pairingCode: null });
  });

  it('delivers with explicit consent, keeping the verifier encrypted in every saved record', async () => {
    const fs = require('node:fs/promises') as typeof import('node:fs/promises');
    const bundle = Buffer.from('mock signed bundle');
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
      const { service, session, repository, wago, inspect, sudo } = securityHarness(
        { firmwareBaseline: '31' },
        configuredService(),
      );
      inspect.mockResolvedValue({
        firmware: 'PTXDIST_PLATFORM_NAME="cc100"\nVERSION_ID="2024.12.0"',
        codesys: 'active',
      });
      const copy = jest.fn().mockResolvedValue(undefined);
      const environment = jest.fn().mockResolvedValue(undefined);
      const install = jest.fn().mockResolvedValue('');
      service['copyTo'] = copy;
      service['writeRuntimeEnvironment'] = environment;
      service['sudoRunScript'] = install;
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
      expect(result.state).toBe('awaiting_discovery');
      expect(sudo).toHaveBeenCalledWith(
        undefined,
        undefined,
        expect.anything(),
        'kill $(pidof codesys3) 2>/dev/null || true',
      );
      expect(copy).toHaveBeenCalledTimes(1);
      expect(install).toHaveBeenCalledTimes(1);
      expect(environment.mock.calls[0][3]).toContain(`WAGO_PAIRING_CODE=${verifier}`);
      expect(session.pairingCode).toBe('encrypted:v1:opaque-ciphertext');
      for (const value of persisted) {
        expect(value).not.toContain(verifier);
        expect(value).not.toMatch(/mqtt-password|claim-secret|explicit-ssh/);
      }
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('extracts runtime bundles without emitting controller-clock timestamp warnings', () => {
    const script = runtimeBundleInstallScript('ghcr.io/attraccess/wago@sha256:abc');
    expect(script).toContain('tar --warning=no-timestamp --warning=no-unknown-keyword -xf');
    expect(script).toContain("-e 's/^Loaded image ID: //p'");
  });

  it('allows a local runtime signing key only during development', () => {
    expect(resolveRuntimeSigningPublicKeyPath('development', '/local/key.pub', '/release/key.pub')).toBe(
      '/local/key.pub',
    );
    expect(() => resolveRuntimeSigningPublicKeyPath('production', '/local/key.pub', '/release/key.pub')).toThrow(
      'local CC100 runtime signing keys are only allowed in development',
    );
  });

  it('recognizes WAGO firmware revision 31 by its PTXdist BSP version', () => {
    expect(isSupportedController('PTXDIST_PLATFORM_NAME="cc100"\nVERSION_ID="2024.12.0"', '31')).toBe(true);
    expect(isSupportedController('PTXDIST_PLATFORM_NAME="cc100"\nVERSION_ID="2024.12.0"', '32')).toBe(false);
  });

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

  it('does not add a sudo password to root command input', async () => {
    const service = new WagoCommissioningService({} as PluginContext, {} as WagoService);
    const run = jest.fn().mockResolvedValue('');
    service['run'] = run;

    await service['sudoRun'](
      '192.168.1.10',
      'SHA256:test',
      { username: 'root', password: 'wago' },
      'base64 -d | sh',
      'script',
    );

    expect(run).toHaveBeenCalledWith(
      '192.168.1.10',
      'SHA256:test',
      { username: 'root', password: 'wago' },
      'base64 -d | sh',
      'script',
    );
  });

  it('sends a sudo password before command input for alternate SSH users', async () => {
    const service = new WagoCommissioningService({} as PluginContext, {} as WagoService);
    const run = jest.fn().mockResolvedValue('');
    service['run'] = run;

    await service['sudoRun'](
      '192.168.1.10',
      'SHA256:test',
      { username: 'operator', password: 'secret' },
      'base64 -d | sh',
      'script',
    );

    expect(run).toHaveBeenCalledWith(
      '192.168.1.10',
      'SHA256:test',
      { username: 'operator', password: 'secret' },
      "sudo -S sh -c 'base64 -d | sh'",
      'secret\nscript',
    );
  });

  it('waits for ssh-keygen before removing the scanned host key', async () => {
    const mockedSpawn = jest.mocked(spawn);
    mockedSpawn.mockImplementation(((command: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: Object.assign(new EventEmitter(), { end: jest.fn() }),
        kill: jest.fn(),
      });
      if (command === 'ssh-keyscan') {
        queueMicrotask(() => {
          child.stdout.emit('data', '192.168.1.10 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey\n');
          child.emit('close', 0);
        });
      } else {
        setTimeout(() => {
          void readFile(args[1], 'utf8').then(
            () => {
              child.stdout.emit('data', '256 SHA256:test generated-key (ED25519)\n');
              child.emit('close', 0);
            },
            (error: Error) => {
              child.stderr.emit('data', error.message);
              child.emit('close', 1);
            },
          );
        }, 25);
      }
      return child;
    }) as never);
    const repository = {
      create: jest.fn((session) => session),
      save: jest.fn(async (session) => session),
      find: jest.fn().mockResolvedValue([]),
    };
    const context = {
      getRepository: jest.fn().mockReturnValue(repository),
      getMqttServerConfig: jest.fn().mockResolvedValue({}),
      secrets,
    } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);
    service.onApplicationBootstrap();

    const session = await service.create({ mqttServerId: 1, targetHost: '192.168.1.10', name: 'Boiler room' });
    expect(session).toMatchObject({
      hardwareId: 'cc100-923d750abecd3ba7',
      hostKeyFingerprint: 'SHA256:test',
      controllerName: 'Boiler room',
      state: 'awaiting_identity_confirmation',
    });
    expect(session).not.toHaveProperty('pairingCode');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ pairingCode: 'encrypted:v1:opaque-ciphertext' }),
    );
  });

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
    const wago = {
      revokeEnrollmentById: jest.fn().mockResolvedValue(undefined),
      deleteEnrollmentById: jest.fn().mockResolvedValue(undefined),
    } as unknown as WagoService;
    const service = new WagoCommissioningService(context, {
      ...wago,
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);
    service.onApplicationBootstrap();

    const inProgressDelivery = service['withDeliveryLock'](session.id, () => delivery);
    await Promise.resolve();
    const revoke = service.revoke(session.id);
    await Promise.resolve();

    expect(repository.findOneBy).not.toHaveBeenCalled();

    releaseDelivery();
    await inProgressDelivery;
    await revoke;

    expect(repository.findOneBy).toHaveBeenCalledWith({ id: session.id });
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(2);
    expect(session.state).toBe('revoked');
  });

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

    expect(listed).toEqual({ id: 1, controllerName: 'Boiler room' });
    expect(listed).not.toHaveProperty('pairingCode');
  });

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

    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(session.enrollmentId);
    expect(wago.deleteEnrollmentById).toHaveBeenCalledWith(session.enrollmentId);
    expect(repository.delete).toHaveBeenCalledWith(session.id);
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
    const context = { getRepository: jest.fn().mockReturnValue(repository), secrets } as unknown as PluginContext;
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

    expect(wago.claim).toHaveBeenCalledWith(9, 'Boiler room', verifier, 2);
    expect(wago.claim).toHaveBeenCalledWith(10, 'Pump room', verifier, 2);
    expect(first.state).toBe('completed');
    expect(second.state).toBe('completed');
    expect(first.pairingCode).toBeNull();
    expect(second.pairingCode).toBeNull();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ auditLog: expect.stringContaining('automatic_claim_completed') }),
    );

    await handler({ id: 11, hardwareId: first.hardwareId, mqttServerId: 4, enrollmentId: 5 });
    expect(wago.claim).toHaveBeenCalledTimes(2);
  });
});
