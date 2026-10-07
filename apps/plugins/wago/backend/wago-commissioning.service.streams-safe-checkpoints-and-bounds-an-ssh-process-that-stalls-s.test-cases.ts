import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import { WagoCommissioningTimeoutError } from './wago-commissioning-progress';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerStreamsSafeCheckpointsAndBoundsAnSshProcessThatStallsS(
  _scope: WagoCommissioningServiceTestScope,
): void {
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
