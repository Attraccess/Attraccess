import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerMapsOnlyTheBoundedStorageDiagnosticFromSshStderrToAFixedMessage(
  _scope: WagoCommissioningServiceTestScope,
): void {
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
            Buffer.from('Insufficient runtime storage: /etc requires 247506 KiB, available 181124 KiB\nprivate-value'),
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
