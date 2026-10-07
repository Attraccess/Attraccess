import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import { fw31IdentityOutput } from './fixtures/fw31-identity';
import { wagoFw31IdentityRead } from './wago-firmware-identity';
import { wagoCodesysClassificationShell } from './wago-codesys-classification';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerStreamsTheFullPrivilegedInspectionOverStdinForS(
  _scope: WagoCommissioningServiceTestScope,
): void {
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
