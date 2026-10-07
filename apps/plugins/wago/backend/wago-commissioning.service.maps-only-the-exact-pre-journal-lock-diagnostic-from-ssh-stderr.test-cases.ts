import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerMapsOnlyTheExactPreJournalLockDiagnosticFromSshStderr(
  _scope: WagoCommissioningServiceTestScope,
): void {
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
      service['run']('192.0.2.1', 'SHA256:changed', { username: 'root', password: 'fixture-only' }, 'true', undefined, {
        timeoutMs: 5000,
        maxOutputBytes: 1024,
        recoveryDiagnostic: true,
      }),
    ).rejects.toThrow('The SSH host key changed');
    await expect(
      service['run']('192.0.2.1', 'SHA256:test', { username: 'root', password: 'fixture-only' }, 'true', undefined, {
        timeoutMs: 5000,
        maxOutputBytes: 1024,
      }),
    ).rejects.toThrow('Commissioning subprocess failed.');
  });
}
