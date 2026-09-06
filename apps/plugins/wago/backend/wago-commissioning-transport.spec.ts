import * as processTools from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningService, shellQuote } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import { generateManagementKey } from './wago-management-key';
import { MANAGEMENT_INSPECTION_COMMAND, parseManagementInspection } from './wago-management-inspection';
import { WagoManagementProvider } from './wago-management-provider';

describe('commissioning SSH transport boundaries', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['dropbear_2025.88', 0, 'supported'],
    ['dropbear_2026.1', 0, 'UNSUPPORTED'],
    ['dropbear_2025.88', 1, 'rejected'],
  ])(
    'observes a non-root connection peer %s only after successful pinned SSH (exit %s)',
    async (version, exit, support) => {
      const key = generateManagementKey();
      const host = '192.0.2.1';
      const observation = 'BEGIN=1\nMODEL=cc100\nFW=31\nUID=1004\nSSH=dropbear\nSSH=dropbear\nEND=1\n';
      jest.spyOn(jest.requireActual<typeof processTools>('node:child_process'), 'spawn').mockImplementation(((
        command: string,
        args: string[],
      ) => {
        const child = Object.assign(new EventEmitter(), {
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          kill: jest.fn(),
          stdin: Object.assign(new EventEmitter(), {
            end: () => {
              if (command === 'ssh-keyscan') child.stdout.emit('data', `${host} ${key.publicKey}\n`);
              else if (command === 'ssh-keygen') child.stdout.emit('data', `256 ${key.fingerprint} fixture\n`);
              else if (command === 'ssh') {
                expect(args).toContain('-v');
                expect(args).toContain('operator@192.0.2.1');
                expect(args).toContain('StrictHostKeyChecking=yes');
                expect(args.join(' ')).not.toContain('/exe');
                child.stderr.emit(
                  'data',
                  Buffer.from(`debug1: Remote protocol version 2.0, remote software version ${version}\r\n`),
                );
                child.stdout.emit('data', observation);
              } else throw new Error('Unexpected fixture process');
              child.emit('close', command === 'ssh' ? exit : 0);
            },
          }),
        });
        return child;
      }) as never);
      const service = new WagoCommissioningService({} as PluginContext, {} as WagoService);
      const result = service['run'](
        host,
        key.fingerprint,
        { username: 'operator', password: 'fixture-only' },
        MANAGEMENT_INSPECTION_COMMAND,
      );
      if (exit) await expect(result).rejects.toThrow();
      else {
        const parsed = parseManagementInspection(await result);
        const provider = new WagoManagementProvider({ execute: jest.fn(), verifyNewKeyConnection: jest.fn() });
        expect(provider.qualify(parsed, 'key_only').support).toBe(support);
        expect(provider.qualify(parsed, 'baseline').support).toBe('UNSUPPORTED');
      }
    },
  );

  it('preserves nested POSIX quotes and the complete management inspection script', () => {
    const command = `printf '%s\\n' 'value=quoted' | awk '/^value=/ {print $0}'`;
    expect(processTools.execFileSync('/bin/sh', ['-c', `sh -c ${shellQuote(command)}`], { encoding: 'utf8' })).toBe(
      'value=quoted\n',
    );
    expect(() =>
      processTools.execFileSync('/bin/sh', ['-n', '-c', `sh -c ${shellQuote(MANAGEMENT_INSPECTION_COMMAND)}`]),
    ).not.toThrow();
  });

  it('loads a generated identity into a dedicated TTL agent from memory only', async () => {
    const key = generateManagementKey();
    const directory = await mkdtemp(join(tmpdir(), 'wago-agent-fixture-'));
    try {
      const output = processTools.execFileSync(
        'ssh-agent',
        ['-t', '30', '-a', join(directory, 'socket'), 'sh', '-c', 'ssh-add -t 30 - >/dev/null 2>&1 && ssh-add -L'],
        {
          input: key.privateKey,
          encoding: 'utf8',
          timeout: 5000,
        },
      );
      expect(output).toContain(key.publicKey);
      expect((await readdir(directory)).filter((name) => name !== 'socket')).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps private material off disk and argv while proving only the generated key', async () => {
    const key = generateManagementKey(),
      nonce = 'a'.repeat(32);
    const host = '192.0.2.1'; // Mock only: every process invocation below is intercepted.
    let captured: string[] = [];
    jest.spyOn(jest.requireActual<typeof processTools>('node:child_process'), 'spawn').mockImplementation(((
      command: string,
      args: string[],
    ) => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: jest.fn(),
        stdin: Object.assign(new EventEmitter(), {
          end: jest.fn((input?: string) => {
            void (async () => {
              if (command === 'ssh-keyscan') child.stdout.emit('data', `${host} ${key.publicKey}\n`);
              else if (command === 'ssh-keygen') child.stdout.emit('data', `256 ${key.fingerprint} fixture\n`);
              else if (command === 'ssh-agent') {
                captured = args;
                expect(input).toBe(key.privateKey);
                expect(JSON.stringify(args)).not.toContain(key.privateKey);
                const directory = dirname(args[args.indexOf('-a') + 1]);
                expect((await readdir(directory)).sort()).toEqual(['identity.pub', 'known_hosts']);
                expect(await readFile(join(directory, 'identity.pub'), 'utf8')).toBe(key.publicKey);
                child.stdout.emit('data', `${nonce}\n10001\n`);
              } else throw new Error('Unexpected process');
              child.emit('close', 0);
            })().catch(() => child.emit('close', 1));
          }),
        }),
      });
      return child;
    }) as never);
    const service = new WagoCommissioningService({} as PluginContext, {} as WagoService);
    const proof = await service['verifyManagementKey'](
      { controllerId: 1, host, hostKeyFingerprint: key.fingerprint },
      'operator',
      key.privateKey,
      nonce,
      { timeoutMs: 1000, maxOutputBytes: 1000 },
    );
    expect(proof).toMatchObject({ keyOnly: true, keyFingerprint: key.fingerprint, uid: 10001, nonce });
    expect(captured.join(' ')).toContain('PasswordAuthentication=no');
    expect(captured.join(' ')).toContain('IdentitiesOnly=yes');
  });
});
