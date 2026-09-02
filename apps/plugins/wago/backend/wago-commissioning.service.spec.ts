import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

describe('WagoCommissioningService', () => {
  it('defers repository access until plugin module initialization', () => {
    const repository = {};
    const context = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as PluginContext;

    const service = new WagoCommissioningService(context, {} as WagoService);

    expect(context.getRepository).not.toHaveBeenCalled();

    service.onModuleInit();

    expect(context.getRepository).toHaveBeenCalledWith(WagoCommissioningSession);
  });

  it('waits for ssh-keygen before removing the scanned host key', async () => {
    const mockedSpawn = jest.mocked(spawn);
    mockedSpawn.mockImplementation(((command: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { end: jest.fn() },
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
    };
    const context = {
      getRepository: jest.fn().mockReturnValue(repository),
      getMqttServerConfig: jest.fn().mockResolvedValue({}),
    } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {} as WagoService);
    service.onModuleInit();

    await expect(service.create({ hardwareId: 'CC100-TEST', mqttServerId: 1, targetHost: '192.168.1.10' })).resolves.toMatchObject({
      hostKeyFingerprint: 'SHA256:test',
      state: 'awaiting_identity_confirmation',
    });
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
    const wago = { revokeEnrollmentById: jest.fn().mockResolvedValue(undefined) } as unknown as WagoService;
    const service = new WagoCommissioningService(context, wago);
    service.onModuleInit();

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
});
