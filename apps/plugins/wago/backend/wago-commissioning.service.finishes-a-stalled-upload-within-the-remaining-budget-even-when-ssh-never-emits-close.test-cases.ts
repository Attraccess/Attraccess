import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerFinishesAStalledUploadWithinTheRemainingBudgetEvenWhenSshNeverEmitsClose(
  _scope: WagoCommissioningServiceTestScope,
): void {
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
    const result = service['operationContext'].run(
      { deadline: Date.now() + 60_100, signal: new AbortController().signal, assertOwned: async () => undefined },
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
