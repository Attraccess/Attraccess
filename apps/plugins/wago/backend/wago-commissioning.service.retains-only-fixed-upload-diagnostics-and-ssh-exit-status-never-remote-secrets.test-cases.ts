import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerRetainsOnlyFixedUploadDiagnosticsAndSshExitStatusNeverRemoteSecrets(
  _scope: WagoCommissioningServiceTestScope,
): void {
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
