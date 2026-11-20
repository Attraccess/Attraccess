import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { fw31IdentityOutput, fw31OsRelease } from '../fixtures/fw31-identity';
import { wagoCodesysClassificationShell } from '../host/codesys-classification';
import { WagoCommissioningTimeoutError } from './delivery/progress';
import { securityHarness } from './harness.test-utils';
import { spyOnWagoStorage } from '../storage-spy.test-utils';
import { createWagoTestStorage } from '../storage/testing';
import {
  isSupportedController,
  runtimeBundleInstallScript,
  WagoCommissioningService,
  WagoControllerLockError,
  WagoRuntimeUploadError,
  WagoStorageCapacityError,
} from './service';
import { WagoDeviceOperations } from '../runtime/device-operations';
import { wagoFw31IdentityRead } from '../host/firmware-identity';
import { WagoManagedProvisioningError } from '../runtime/managed/provisioning/provisioning-error';
import { WagoService } from '../controllers/service';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

const verifier = 'v'.repeat(43);

const secrets = {
  encrypt: jest.fn().mockReturnValue('opaque-ciphertext'),
  decrypt: jest.fn().mockReturnValue(verifier),
};

describe('WagoCommissioningService transport and diagnostics', () => {
  {
    it.each([false, true])('streams safe checkpoints and bounds an SSH process that stalls (%s)', async (stall) => {
      const service = new WagoCommissioningService({} as PluginContext, {} as WagoService);
      const progress = jest.fn();
      const kill = jest.fn();
      jest.mocked(spawn).mockImplementation(((command: string) => {
        const child = Object.assign(new EventEmitter(), {
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          stdin: new PassThrough(),
          kill,
        });
        child.stdin.resume();
        child.stdin.on('finish', () => {
          if (command === 'ssh-keyscan')
            child.stdout.emit('data', '192.0.2.1 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey\n');
          else if (command === 'ssh-keygen') child.stdout.emit('data', '256 SHA256:test fixture (ED25519)\n');
          else {
            child.stdout.emit('data', 'WAGO_PROG');
            child.stdout.emit('data', 'RESS=preparation-io\nready\n');
            child.stderr.emit('data', Buffer.from('private-value'));
          }
          if (command !== 'ssh' || !stall) child.emit('close', 0);
        });
        return child;
      }) as never);
      const result = service['run'](
        '192.0.2.1',
        'SHA256:test',
        { username: 'root', password: 'fixture-only' },
        'true',
        undefined,
        { timeoutMs: 50, maxOutputBytes: 1024, onProgress: progress },
      );
      if (stall) {
        await expect(result).rejects.toThrow(WagoCommissioningTimeoutError);
        expect(kill).toHaveBeenCalled();
      } else await expect(result).resolves.toBe('ready\n');
      expect(progress.mock.calls).toEqual([['preparation-io']]);
    });
  }

  it('drains checkpoint writes before saving a preparation failure', async () => {
    const { service, session, storage, spied } = await securityHarness({ deliveryToken: null });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const update = spied.commissioningSessions.update;
    // Only the first write (the checkpoint) waits for the gate; the failure save that follows runs for real.
    update.mockImplementation(async (where, patch, options) => {
      // A checkpoint patch carries only the progress fields; the failure save writes the whole row.
      if (!('hardwareId' in patch)) await gate;
      return storage.tables.commissioningSessions.update(where, patch, options);
    });
    service['sudoRunScript'] = jest
      .fn()
      .mockResolvedValueOnce('')
      .mockImplementationOnce((_host, _fingerprint, _credential, _script, limits) => {
        limits.onProgress('preparation-io');
        throw new Error('fixture interruption');
      });
    const result = service['prepareController'](session, { username: 'root', password: 'fixture-only' }, 512);
    const rejection = expect(result).rejects.toThrow('fixture interruption');
    await new Promise((resolve) => setImmediate(resolve));
    expect(update).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ progressPercent: 33, progressStep: 'Verifying exclusive output access' }),
    );
    expect(session.dockerProvisionState).toBe('starting');
    release();
    await rejection;
    expect(session.dockerProvisionState).toBe('recovery_required');
    expect(JSON.parse(session.auditLog).at(-1).event).toBe('controller_preparation_failed');
  });

  {
    it('finishes a stalled upload within the remaining budget even when SSH never emits close', async () => {
      const service = new WagoCommissioningService({} as PluginContext, {} as WagoService);
      const kill = jest.fn();
      jest.mocked(spawn).mockImplementation(((command: string) => {
        const child = Object.assign(new EventEmitter(), {
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          stdin: new PassThrough(),
          kill,
        });
        child.stdin.resume();
        child.stdin.on('finish', () => {
          if (command === 'ssh-keyscan')
            child.stdout.emit('data', '192.0.2.1 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey\n');
          else if (command === 'ssh-keygen') child.stdout.emit('data', '256 SHA256:test fixture (ED25519)\n');
          if (command !== 'ssh') child.emit('close', 0);
        });
        return child;
      }) as never);
      // 60 s are reserved for cleanup; the second on top must outlast setup on a loaded runner, or the operation
      // times out before the upload it is meant to stall.
      const result = service['operationContext'].run(
        { deadline: Date.now() + 61_000, signal: new AbortController().signal, assertOwned: async () => undefined },
        () =>
          service['copyTo'](
            '192.0.2.1',
            'SHA256:test',
            { username: 'root', password: 'fixture-only' },
            __filename,
            'true',
            jest.fn(),
          ),
      );
      await expect(result).rejects.toThrow(/Runtime delivery failed: local-timeout/);
      expect(kill).toHaveBeenCalled();
    });
  }

  it('checks FW31 management tools before preparation and retains the actionable reason', async () => {
    const { service, stored, wago, inspect } = await securityHarness({ firmwareBaseline: '31', deliveryToken: null });
    const locks = [
      jest.spyOn(WagoDeviceOperations.prototype, 'acquire').mockResolvedValue(true),
      jest.spyOn(WagoDeviceOperations.prototype, 'assertOwned').mockResolvedValue(undefined),
      jest.spyOn(WagoDeviceOperations.prototype, 'release').mockResolvedValue(undefined),
    ];
    inspect.mockResolvedValue({ firmware: fw31IdentityOutput(), codesys: 'inactive' });
    Object.assign(service, {
      managedRuntime: { hasAccess: async () => false, assertNetworkSettled: async () => undefined },
    });
    service['requireRuntimeArtifact'] = jest.fn().mockResolvedValue(undefined);
    service['acquireRuntimeBundle'] = jest
      .fn()
      .mockResolvedValue({ bytes: 512, path: '/mock/runtime.tar', directory: '/mock/staging' });
    service['sudoRunScript'] = jest.fn().mockRejectedValueOnce(new WagoManagedProvisioningError('tools'));
    service['prepareController'] = jest.fn();
    try {
      const result = await service.deliver(1, {
        confirmInstall: true,
        temporarySsh: { username: 'root', password: 'fixture-only' },
      });
      expect(result.failureReason).toContain('Check that passwd, useradd, groupadd and sudo are installed.');
      expect(result.progressDetail).toContain('No controller preparation started');
      expect(service['prepareController']).not.toHaveBeenCalled();
      expect(service['sudoRunScript']).toHaveBeenCalledTimes(1);
      expect(wago.createEnrollment).not.toHaveBeenCalled();
      expect((await stored())?.dockerProvisionToken).toBeFalsy();
    } finally {
      for (const lock of locks) lock.mockRestore();
    }
  });

  {
    it('retains only fixed upload diagnostics and SSH exit status, never remote secrets', async () => {
      const service = new WagoCommissioningService({} as PluginContext, {} as WagoService);
      jest.mocked(spawn).mockImplementation(((command: string) => {
        const child = Object.assign(new EventEmitter(), {
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          stdin: new PassThrough(),
          kill: jest.fn(),
        });
        child.stdin.resume();
        child.stdin.on('finish', () => {
          if (command === 'ssh-keyscan') {
            child.stdout.emit('data', '192.0.2.1 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey\n');
          } else if (command === 'ssh-keygen') {
            child.stdout.emit('data', '256 SHA256:test fixture (ED25519)\n');
          } else {
            child.stderr.emit(
              'data',
              Buffer.from('private-credential'.repeat(1000) + '\nRuntime supervisor launch unverified: read'),
            );
            child.stderr.emit('data', Buffer.from('iness\nprivate-credential\n'));
          }
          child.emit('close', command === 'ssh' ? 1 : 0);
        });
        return child;
      }) as never);
      const result = service['copyTo'](
        '192.0.2.1',
        'SHA256:test',
        { username: 'root', password: 'fixture-secret' },
        __filename,
        'true',
        jest.fn(),
      );
      await expect(result).rejects.toThrow(
        /remote-exit, SSH exit 1, \d+s elapsed\. Runtime supervisor launch unverified: readiness/,
      );
      await expect(result).rejects.not.toThrow('private-credential');
    });
  }

  it('reports staging capacity failures without suggesting controller preparation cleanup', async () => {
    const { service, stored, wago, inspect } = await securityHarness({ firmwareBaseline: '31', deliveryToken: null });
    inspect.mockResolvedValue({ firmware: fw31IdentityOutput(), codesys: 'inactive' });
    service['requireRuntimeArtifact'] = jest.fn().mockResolvedValue(undefined);
    service['acquireRuntimeBundle'] = jest
      .fn()
      .mockResolvedValue({ bytes: 512, path: '/mock/runtime.tar', directory: '/mock/staging' });
    service['sudoRunScript'] = jest.fn().mockRejectedValueOnce(new WagoStorageCapacityError());
    const result = await service.deliver(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'fixture-only' },
    });
    expect(result.state).toBe('delivery_failed');
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(service['sudoRunScript']).toHaveBeenCalledTimes(1);
    expect(result.failureReason).toBe('Not enough free storage on the CC100 for this runtime. Free space and retry.');
    expect(result.progressDetail).toBe('Free space on the CC100, then retry installation.');
    expect((await stored())?.dockerProvisionToken).toBeFalsy();
    expect(wago.createEnrollment).not.toHaveBeenCalled();
  });

  it('keeps a lock-busy preparation retryable without a phantom recovery token', async () => {
    const { service, stored, wago, inspect } = await securityHarness({ firmwareBaseline: '31', deliveryToken: null });
    inspect.mockResolvedValue({ firmware: fw31IdentityOutput(), codesys: 'inactive' });
    service['requireRuntimeArtifact'] = jest.fn().mockResolvedValue(undefined);
    service['acquireRuntimeBundle'] = jest
      .fn()
      .mockResolvedValue({ bytes: 512, path: '/mock/runtime.tar', directory: '/mock/staging' });
    service['sudoRunScript'] = jest.fn().mockResolvedValueOnce('').mockRejectedValueOnce(new WagoControllerLockError());
    const result = await service.deliver(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'fixture-only' },
    });
    expect(result.state).toBe('delivery_failed');
    expect(result.failureReason).toContain('Retry installation shortly; no preparation was started.');
    expect(result.progressDetail).toContain('No preparation started');
    expect(await stored()).toMatchObject({ dockerProvisionToken: null, dockerProvisionState: null });
    expect(wago.createEnrollment).not.toHaveBeenCalled();
  });

  {
    it('maps only the bounded storage diagnostic from SSH stderr to a fixed message', async () => {
      const service = new WagoCommissioningService({} as PluginContext, {} as WagoService);
      jest.mocked(spawn).mockImplementation(((command: string) => {
        const child = Object.assign(new EventEmitter(), {
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          stdin: new PassThrough(),
          kill: jest.fn(),
        });
        child.stdin.resume();
        child.stdin.on('finish', () => {
          if (command === 'ssh-keyscan')
            child.stdout.emit('data', '192.0.2.1 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey\n');
          else if (command === 'ssh-keygen') child.stdout.emit('data', '256 SHA256:test fixture (ED25519)\n');
          else
            child.stderr.emit(
              'data',
              Buffer.from(
                'Insufficient runtime storage: /etc requires 247506 KiB, available 181124 KiB\nprivate-value',
              ),
            );
          child.emit('close', command === 'ssh' ? 1 : 0);
        });
        return child;
      }) as never);
      await expect(
        service['run']('192.0.2.1', 'SHA256:test', { username: 'root', password: 'fixture-only' }, 'true', undefined, {
          timeoutMs: 5000,
          maxOutputBytes: 1024,
          storageDiagnostic: true,
        }),
      ).rejects.toThrow('Not enough free storage on the CC100 for this runtime. Free space and retry.');
    });
  }

  {
    it('maps only the exact pre-journal lock diagnostic from SSH stderr', async () => {
      const service = new WagoCommissioningService({} as PluginContext, {} as WagoService);
      jest.mocked(spawn).mockImplementation(((command: string) => {
        const child = Object.assign(new EventEmitter(), {
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          stdin: new PassThrough(),
          kill: jest.fn(),
        });
        child.stdin.resume();
        child.stdin.on('finish', () => {
          if (command === 'ssh-keyscan')
            child.stdout.emit('data', '192.0.2.1 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey\n');
          else if (command === 'ssh-keygen') child.stdout.emit('data', '256 SHA256:test fixture (ED25519)\n');
          else
            child.stderr.emit(
              'data',
              Buffer.from('private-value\nAnother runtime transaction holds the controller lock\n'),
            );
          child.emit('close', command === 'ssh' ? 1 : 0);
        });
        return child;
      }) as never);
      await expect(
        service['run']('192.0.2.1', 'SHA256:test', { username: 'root', password: 'fixture-only' }, 'true', undefined, {
          timeoutMs: 5000,
          maxOutputBytes: 1024,
          lockDiagnostic: true,
        }),
      ).rejects.toThrow('The CC100 is busy with a runtime operation');
      await expect(
        service['run']('192.0.2.1', 'SHA256:test', { username: 'root', password: 'fixture-only' }, 'true', undefined, {
          timeoutMs: 5000,
          maxOutputBytes: 1024,
          recoveryDiagnostic: true,
        }),
      ).rejects.toThrow('did not release the controller lock within 310 seconds');
      await expect(
        service['run'](
          '192.0.2.1',
          'SHA256:changed',
          { username: 'root', password: 'fixture-only' },
          'true',
          undefined,
          {
            timeoutMs: 5000,
            maxOutputBytes: 1024,
            recoveryDiagnostic: true,
          },
        ),
      ).rejects.toThrow('The SSH host key changed');
      await expect(
        service['run']('192.0.2.1', 'SHA256:test', { username: 'root', password: 'fixture-only' }, 'true', undefined, {
          timeoutMs: 5000,
          maxOutputBytes: 1024,
        }),
      ).rejects.toThrow('Commissioning subprocess failed.');
    });
  }

  {
    it.each(['local-timeout', 'operation-aborted'] as const)(
      'distinguishes %s without treating remote text as trusted diagnostics',
      (termination) => {
        const error = new WagoRuntimeUploadError(
          null,
          123456,
          'secret: Runtime supervisor launch unverified: readiness\n',
          termination,
        );
        expect(error.message).toContain(`${termination}, SSH exit unknown, 123s elapsed`);
        expect(error.message).toContain('No recognized remote diagnostic');
        expect(error.message).not.toContain('secret');
      },
    );
  }

  {
    it('reports the fixed image-load failure without exposing other remote output', () => {
      const error = new WagoRuntimeUploadError(
        1,
        300_000,
        'private-value\nRuntime image load failed or exceeded 300 seconds\n',
      );
      expect(error.message).toContain('Runtime image load failed or exceeded 300 seconds');
      expect(error.message).not.toContain('private-value');
    });
  }

  it('releases a settled local rejection so a corrected request can retry', async () => {
    const { service } = await securityHarness();
    await expect(
      service['withControllerLock'](1, async () => {
        throw new Error('qualification_required');
      }),
    ).rejects.toThrow('qualification_required');
    await expect(service['withControllerLock'](1, async () => 'retry')).resolves.toBe('retry');
  });

  it('serializes operations for the same controller in this process', async () => {
    const { service } = await securityHarness();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const calls: string[] = [];
    const first = service['withControllerLock'](1, async () => {
      calls.push('first');
      await pending;
    });
    const second = service['withControllerLock'](1, async () => {
      calls.push('second');
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls).toEqual(['first']);
    finish();
    await Promise.all([first, second]);
    expect(calls).toEqual(['first', 'second']);
  });

  {
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
  }
  it('extracts runtime bundles without emitting controller-clock timestamp warnings', () => {
    const script = runtimeBundleInstallScript(`ghcr.io/attraccess/wago@sha256:${'a'.repeat(64)}`);
    expect(script).toContain('tar --warning=no-timestamp --warning=no-unknown-keyword -xOf');
    expect(script).toContain("-e 's/^Loaded image ID: //p'");
  });

  it('requires framed FW31 identity including REVISIONS and the supported baseline', () => {
    expect(isSupportedController(fw31IdentityOutput(fw31OsRelease, ''), '31')).toBe(false);
    expect(isSupportedController(fw31IdentityOutput(), '31')).toBe(true);
    expect(isSupportedController(fw31IdentityOutput(), '32')).toBe(false);
  });

  {
    it.each(['root', 'operator'])('streams the full privileged inspection over stdin for %s', async (username) => {
      const service = new WagoCommissioningService({} as PluginContext, {} as WagoService);
      const credential = { username, password: 'fixture-only' };
      const firmware = fw31IdentityOutput();
      const script = `${wagoFw31IdentityRead()}; root=''; ${wagoCodesysClassificationShell()}\nprintf '\\nCODESYS='; wago_codesys_classify`;
      const ssh = jest.fn();
      let output = '';
      jest.mocked(spawn).mockImplementation(((command: string, args: string[]) => {
        const child = Object.assign(new EventEmitter(), {
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          kill: jest.fn(),
          stdin: Object.assign(new EventEmitter(), {
            end: (input?: string) => {
              if (command === 'ssh-keyscan') {
                child.stdout.emit('data', '192.0.2.1 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey\n');
              } else if (command === 'ssh-keygen') {
                child.stdout.emit('data', '256 SHA256:test fixture (ED25519)\n');
              } else if (command === 'ssh') {
                ssh(args, input);
                child.stdout.emit('data', output);
              } else throw new Error('Unexpected fixture process');
              child.emit('close', 0);
            },
          }),
        });
        return child;
      }) as never);

      for (const classification of ['active', 'inactive', 'unknown', 'invalid', '']) {
        output = firmware + (classification ? `\nCODESYS=${classification}\n` : '');
        await expect(service['inspect']('192.0.2.1', 'SHA256:test', credential)).resolves.toEqual({
          firmware,
          codesys: ['active', 'inactive'].includes(classification) ? classification : 'unknown',
        });
      }

      expect(Buffer.byteLength(script)).toBeGreaterThan(16_000);
      expect(ssh).toHaveBeenCalledTimes(5);
      for (const [args, input] of ssh.mock.calls) {
        expect(args).toContain('StrictHostKeyChecking=yes');
        expect(args).toContain(`${username}@192.0.2.1`);
        expect(args.at(-1)).toBe(
          username === 'root' ? "sh -c 'base64 -d | sh'" : String.raw`sh -c 'sudo -S sh -c '\''base64 -d | sh'\'''`,
        );
        const encoded = username === 'root' ? input : input.slice(`${credential.password}\n`.length);
        expect(input).toBe(
          `${username === 'root' ? '' : `${credential.password}\n`}${Buffer.from(script).toString('base64')}`,
        );
        expect(Buffer.from(encoded, 'base64').toString()).toBe(script);
      }
    });
  }

  {
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
        undefined,
      );
    });
  }

  {
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
        undefined,
      );
    });
  }

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
    const storage = createWagoTestStorage();
    const spy = spyOnWagoStorage(storage);
    const context = {
      ...spy.context,
      getMqttServerConfig: jest.fn().mockResolvedValue({}),
      secrets: secrets,
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
    expect(await storage.tables.commissioningSessions.find()).toMatchObject([
      { id: session.id, pairingCode: 'encrypted:v1:opaque-ciphertext' },
    ]);
  });
});
