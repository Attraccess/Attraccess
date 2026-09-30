import * as processes from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile, access as fileAccess } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { generateManagementKey } from './wago-management-key';
import { WagoManagedAccess } from './wago-managed-access.entity';
import { managedSsh } from './wago-managed-ssh';

describe('production managed SSH transport', () => {
  afterEach(() => jest.restoreAllMocks());
  const host = '10.77.0.7',
    token = 'a'.repeat(32);

  function fixture(mode: 'ok' | 'host-change' | 'wait' | 'noisy') {
    const hostKey = generateManagementKey(),
      identity = generateManagementKey();
    const actualSpawn = jest.requireActual<typeof processes>('node:child_process').spawn;
    const children: processes.ChildProcess[] = [];
    const calls: { command: string; args: string[] }[] = [];
    let directory = '';
    let releaseStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      releaseStarted = resolve;
    });
    jest.spyOn(jest.requireActual<typeof processes>('node:child_process'), 'spawn').mockImplementation(((
      command: string,
      args: string[],
      options: processes.SpawnOptions,
    ) => {
      calls.push({ command, args });
      let child: processes.ChildProcess;
      if (command === 'ssh-keyscan') {
        child = actualSpawn(
          process.execPath,
          [
            '-e',
            'process.stdout.write(process.argv[1])',
            `${host} ${mode === 'host-change' ? identity.publicKey : hostKey.publicKey}\n`,
          ],
          options,
        );
      } else if (command === 'ssh') {
        directory = dirname(args[args.indexOf('-i') + 1]);
        const script =
          mode === 'wait'
            ? 'process.stdin.resume(); setInterval(()=>{},1000)'
            : mode === 'noisy'
              ? 'process.stderr.write("fixture-secret".repeat(2000)); setInterval(()=>{},1000)'
              : 'const chunks=[];process.stdin.on("data",c=>chunks.push(c));process.stdin.on("end",()=>process.stdout.write(Buffer.concat(chunks).toString("base64")))';
        child = actualSpawn(process.execPath, ['-e', script], options);
        releaseStarted();
      } else child = actualSpawn(command, args, options);
      children.push(child);
      return child;
    }) as typeof processes.spawn);
    const target = Object.assign(new WagoManagedAccess(), {
      host,
      fingerprint: hostKey.fingerprint,
      keyFingerprint: identity.fingerprint,
    });
    return { identity, hostKey, target, children, calls, started, directory: () => directory };
  }

  function expectReaped(children: processes.ChildProcess[]) {
    for (const child of children) {
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      if (child.pid) expect(() => process.kill(child.pid as number, 0)).toThrow();
    }
  }

  it('rejects a changed pinned host before starting any authentication process', async () => {
    const test = fixture('host-change');
    await expect(
      managedSsh(test.target, test.identity.privateKey, `proof ${token}`, new AbortController().signal),
    ).rejects.toThrow('identity changed');
    expect(test.calls.map((call) => call.command)).toEqual(['ssh-keyscan']);
    expectReaped(test.children);
  });

  it('uses a real isolated TTL agent and key-only arguments, streams binary data after the header, and cleans its files/processes', async () => {
    const test = fixture('ok');
    const directory = await mkdtemp(join(tmpdir(), 'att1099-transport-test-'));
    const bytes = Buffer.from([0, 255, 13, 10, 0, 1, 128]);
    const bundle = join(directory, 'image.tar');
    await writeFile(bundle, bytes);
    try {
      const operation = managedSsh(
        test.target,
        test.identity.privateKey,
        `stage ${token}`,
        new AbortController().signal,
        bundle,
      );
      await test.started;
      expect((await readdir(test.directory())).sort()).toEqual(['agent.sock', 'identity.pub', 'known_hosts']);
      expect(await readFile(join(test.directory(), 'identity.pub'), 'utf8')).toBe(test.identity.publicKey);
      expect(await readFile(join(test.directory(), 'known_hosts'), 'utf8')).toBe(`${host} ${test.hostKey.publicKey}\n`);
      expect(Buffer.from(await operation, 'base64')).toEqual(Buffer.concat([Buffer.from(`stage ${token}\n`), bytes]));
      const ssh = test.calls.find((call) => call.command === 'ssh')?.args ?? [];
      expect(ssh).toEqual(
        expect.arrayContaining([
          '-F',
          '/dev/null',
          'IdentitiesOnly=yes',
          'PreferredAuthentications=publickey',
          'PasswordAuthentication=no',
          'KbdInteractiveAuthentication=no',
          'StrictHostKeyChecking=yes',
          'BatchMode=yes',
          'attraccess@10.77.0.7',
          `IdentityAgent=${join(test.directory(), 'agent.sock')}`,
        ]),
      );
      expect(test.calls.find((call) => call.command === 'ssh-agent')?.args).toEqual(
        expect.arrayContaining(['-t', '1800']),
      );
      expect(test.calls.find((call) => call.command === 'ssh-add')?.args).toEqual(['-t', '1800', '-']);
      expect(JSON.stringify(test.calls)).not.toContain('PRIVATE KEY');
      await expect(fileAccess(test.directory())).rejects.toThrow();
      expectReaped(test.children);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(['wait', 'noisy'] as const)(
    'reaps the SSH process and isolated agent after %s, with no raw stderr in errors',
    async (mode) => {
      const test = fixture(mode),
        abort = new AbortController();
      const operation = managedSsh(test.target, test.identity.privateKey, `proof ${token}`, abort.signal);
      const rejected = expect(operation).rejects.toThrow('offline');
      await test.started;
      if (mode === 'wait') abort.abort();
      await rejected;
      await expect(fileAccess(test.directory())).rejects.toThrow();
      expectReaped(test.children);
    },
  );
});
