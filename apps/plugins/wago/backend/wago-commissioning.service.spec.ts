import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
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

describe('WagoCommissioningService', () => {
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
      secrets: { encrypt: jest.fn((value: string) => `v1.${value}`), decrypt: jest.fn((value: string) => value.slice(3)) },
    } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);
    await service.onApplicationBootstrap();

    const session = await service.create({ mqttServerId: 1, targetHost: '192.168.1.10', name: 'Boiler room' });
    expect(session).toMatchObject({
      hardwareId: 'cc100-923d750abecd3ba7',
      hostKeyFingerprint: 'SHA256:test',
      controllerName: 'Boiler room',
      state: 'awaiting_identity_confirmation',
    });
    expect(session).not.toHaveProperty('pairingCode');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ pairingCode: expect.stringMatching(/^v1\./) }),
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
      find: jest.fn().mockResolvedValue([]),
    };
    const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
    let releaseDelivery!: () => void;
    const delivery = new Promise<void>((resolve) => (releaseDelivery = resolve));
    const wago = { revokeEnrollmentById: jest.fn().mockResolvedValue(undefined) } as unknown as WagoService;
    const service = new WagoCommissioningService(context, {
      ...wago,
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);
    await service.onApplicationBootstrap();

    const inProgressDelivery = service['withDeliveryLock'](session.id, () => delivery);
    await Promise.resolve();
    const revoke = service.revoke(session.id);
    await Promise.resolve();

    expect(repository.findOneBy).not.toHaveBeenCalled();

    releaseDelivery();
    await inProgressDelivery;
    await revoke;

    expect(repository.findOneBy).toHaveBeenCalledWith({ id: session.id });
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(session.enrollmentId);
    expect(session.state).toBe('revoked');
  });

  it('finishes legacy verifier cleanup before discovery work is registered', async () => {
    const session = {
      id: 1,
      pairingCode: 'plaintext',
      enrollmentId: 2,
      state: 'awaiting_delivery',
      auditLog: '[]',
      updatedAt: '',
    } as WagoCommissioningSession;
    const repository = {
      find: jest.fn().mockResolvedValueOnce([session]).mockResolvedValue([]),
      findOneBy: jest.fn().mockResolvedValue(session),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    let finishRevocation!: () => void;
    const revocation = new Promise<void>((resolve) => (finishRevocation = resolve));
    const registerCommissioningDiscoveryHandler = jest.fn();
    const service = new WagoCommissioningService(
      { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext,
      {
        registerCommissioningDiscoveryHandler,
        revokeEnrollmentById: jest.fn().mockReturnValue(revocation),
      } as unknown as WagoService,
    );

    const bootstrap = service.onApplicationBootstrap();
    await Promise.resolve();

    expect(registerCommissioningDiscoveryHandler).not.toHaveBeenCalled();

    finishRevocation();
    await bootstrap;

    expect(registerCommissioningDiscoveryHandler).toHaveBeenCalled();
    expect(session).toMatchObject({ pairingCode: null, state: 'revoked' });
  });

  it('does not register commissioning discovery when initial legacy verifier cleanup fails', async () => {
    const first = {
      id: 1,
      pairingCode: 'plaintext-first',
      enrollmentId: 2,
      state: 'awaiting_delivery',
      auditLog: '[]',
      updatedAt: '',
    } as WagoCommissioningSession;
    const second = { ...first, id: 2, pairingCode: 'plaintext-second', enrollmentId: 3 };
    const sessions = [first, second];
    const registerCommissioningDiscoveryHandler = jest.fn();
    const repository = {
      find: jest.fn().mockResolvedValue(sessions),
      findOneBy: jest.fn().mockImplementation(async ({ id }) => sessions.find((session) => session.id === id) ?? null),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const revokeEnrollmentById = jest
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(undefined);
    const service = new WagoCommissioningService(
      { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext,
      { registerCommissioningDiscoveryHandler, revokeEnrollmentById } as unknown as WagoService,
    );

    await expect(service.onApplicationBootstrap()).rejects.toThrow('unavailable');

    expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ order: { id: 'ASC' }, take: 100 }));
    expect(revokeEnrollmentById).toHaveBeenCalledWith(first.enrollmentId);
    expect(revokeEnrollmentById).toHaveBeenCalledWith(second.enrollmentId);
    expect(first).toMatchObject({ pairingCode: 'plaintext-first', state: 'awaiting_delivery' });
    expect(second).toMatchObject({ pairingCode: null, state: 'revoked' });
    expect(registerCommissioningDiscoveryHandler).not.toHaveBeenCalled();
  });

  it('does not expose stored commissioning verifiers in session lists', async () => {
    const repository = {
      find: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValue([
          { id: 1, controllerName: 'Boiler room', pairingCode: 'v1.ciphertext' } as WagoCommissioningSession,
        ]),
    };
    const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);
    await service.onApplicationBootstrap();

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
      find: jest.fn().mockResolvedValue([]),
    };
    const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);
    await service.onApplicationBootstrap();

    await expect(service.confirmHostKey(session.id, 'SHA256:other')).rejects.toThrow('does not match');
    await expect(service.confirmHostKey(session.id, session.hostKeyFingerprint)).resolves.toMatchObject({
      state: 'awaiting_wbm_confirmation',
      progressStep: 'Complete WAGO bootstrap',
    });
  });

  it('rejects direct delivery before the scanned host key is confirmed', async () => {
    const session = { id: 1, state: 'awaiting_identity_confirmation' } as WagoCommissioningSession;
    const repository = { findOneBy: jest.fn().mockResolvedValue(session), find: jest.fn().mockResolvedValue([]) };
    const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);
    await service.onApplicationBootstrap();

    await expect(service.deliver(session.id)).rejects.toThrow('cannot be delivered in its current state');
  });

  it('requires an explicit temporary SSH credential for every delivery attempt', async () => {
    const session = { id: 1, state: 'awaiting_delivery' } as WagoCommissioningSession;
    const repository = { findOneBy: jest.fn().mockResolvedValue(session), find: jest.fn().mockResolvedValue([]) };
    const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);
    await service.onApplicationBootstrap();

    await expect(service.deliver(session.id)).rejects.toThrow('temporary SSH username and password are required');
  });

  it('requires explicit WBM and CODESYS confirmations before delivery can continue', async () => {
    const session = {
      id: 1,
      state: 'awaiting_wbm_confirmation',
      progressPercent: 0,
      progressStep: '',
      progressDetail: '',
      auditLog: '[]',
      updatedAt: '',
    } as WagoCommissioningSession;
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(session),
      save: jest.fn().mockImplementation(async (value) => value),
      find: jest.fn().mockResolvedValue([]),
    };
    const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);
    await service.onApplicationBootstrap();

    await expect(service.confirmWbmBootstrap(session.id)).resolves.toMatchObject({ state: 'awaiting_delivery' });
    session.state = 'awaiting_codesys_confirmation';
    await expect(service.confirmCodesysStop(session.id)).resolves.toMatchObject({
      state: 'awaiting_delivery',
      codesysState: 'stop_confirmed',
    });
  });

  it('revokes and removes an enrollment session without retaining its records', async () => {
    const session = { id: 1, enrollmentId: 2 } as WagoCommissioningSession;
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(session),
      delete: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
    const wago = {
      registerCommissioningDiscoveryHandler: jest.fn(),
      revokeEnrollmentById: jest.fn().mockResolvedValue(undefined),
      deleteEnrollmentById: jest.fn().mockResolvedValue(undefined),
    } as unknown as WagoService;
    const service = new WagoCommissioningService(context, wago);
    await service.onApplicationBootstrap();

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
      pairingCode: 'v1.482931',
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
      pairingCode: 'v1.593841',
    };
    const sessions = [first, second];
    const repository = {
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
      find: jest.fn().mockResolvedValue([]),
    };
    const registerCommissioningDiscoveryHandler = jest.fn();
    const wago = {
      registerCommissioningDiscoveryHandler,
      claim: jest.fn().mockResolvedValue(undefined),
    } as unknown as WagoService;
    const context = {
      getRepository: jest.fn().mockReturnValue(repository),
      secrets: { decrypt: (value: string) => value.slice(3) },
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

    expect(wago.claim).toHaveBeenCalledWith(9, 'Boiler room', '482931', 2);
    expect(wago.claim).toHaveBeenCalledWith(10, 'Pump room', '593841', 2);
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
