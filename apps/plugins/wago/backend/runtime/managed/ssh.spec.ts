import * as processes from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile, access as fileAccess } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { generateManagementKey } from '../../management/key';
import { WagoManagedAccess } from './access.entity';
import { managedSsh, managedSshFailure, managedSshStorageDiagnostics } from './ssh';

it.each([
  ['head: invalid option -- c', 'receiver_tools'],
  ['Runtime transfer receiver failed', 'receiver_tools'],
  ['Runtime transfer receiver timed out', 'transfer_timeout'],
  ['Incomplete or oversized runtime transfer', 'transfer_size'],
  ['Runtime checksum mismatch', 'transfer_checksum'],
] as const)('keeps the specific transfer failure %s', (stderr, failure) => {
  expect(managedSshFailure(stderr, 'transfer')).toBe(failure);
});

it('preserves only bounded numeric storage diagnostics from SSH stderr', () => {
  expect(
    managedSshStorageDiagnostics(
      'fixture-secret\nInsufficient runtime storage: /var/lib requires 180397 KiB, available 176652 KiB\n',
    ),
  ).toEqual([{ path: '/var/lib', requiredKiB: 180397, availableKiB: 176652 }]);
  for (const line of [
    'Insufficient runtime storage: /var/lib requires nope KiB, available 1 KiB',
    'Insufficient runtime storage: /var/../secret requires 2 KiB, available 1 KiB',
    'Insufficient runtime storage: /var/lib requires 9999999999999 KiB, available 1 KiB',
    'Insufficient runtime storage: /var/lib requires 1 KiB, available 2 KiB',
    'Insufficient runtime storage: /var/lib requires 2 KiB, available 1 KiB fixture-secret',
  ])
    expect(managedSshStorageDiagnostics(line)).toEqual([]);
});

describe('production managed SSH transport', () => {
  afterEach(() => jest.restoreAllMocks());
  const host = '10.77.0.7',
    token = 'a'.repeat(32);

  function fixture(mode: 'ok' | 'host-change' | 'wait' | 'noisy' | 'storage', selectedHost = host) {
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
            `${selectedHost} ${mode === 'host-change' ? identity.publicKey : hostKey.publicKey}\n`,
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
              : mode === 'storage'
                ? 'process.stdin.resume(); process.stdin.on("end",()=>{process.stderr.write("Insufficient runtime storage: /var/lib requires 180396 KiB, available 179724 KiB\\nfixture-secret\\n");process.exitCode=1})'
                : 'const chunks=[];process.stdin.on("data",c=>chunks.push(c));process.stdin.on("end",()=>process.stdout.write(Buffer.concat(chunks).toString("base64")))';
        child = actualSpawn(process.execPath, ['-e', script], options);
        releaseStarted();
      } else child = actualSpawn(command, args, options);
      children.push(child);
      return child;
    }) as typeof processes.spawn);
    const target = Object.assign(new WagoManagedAccess(), {
      host: selectedHost,
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
    ).rejects.toMatchObject({ failure: 'host_identity' });
    expect(test.calls.map((call) => call.command)).toEqual(['ssh-keyscan']);
    expectReaped(test.children);
  });

  it('scans and authenticates only the new IP with the existing pinned fingerprint', async () => {
    const newHost = '192.168.2.50',
      test = fixture('ok', newHost);
    const output = await managedSsh(
      test.target,
      test.identity.privateKey,
      `proof ${token}`,
      new AbortController().signal,
    );
    expect(Buffer.from(output, 'base64').toString()).toBe(`proof ${token}\n`);
    expect(test.calls.find((call) => call.command === 'ssh-keyscan')?.args).toContain(newHost);
    expect(test.calls.find((call) => call.command === 'ssh')?.args).toContain(`attraccess@${newHost}`);
    expect(test.calls.some((call) => call.args.includes(host) || call.args.includes(`attraccess@${host}`))).toBe(false);
    expectReaped(test.children);
  });

  it('returns actionable capacity figures from a failed SSH operation without returning raw stderr', async () => {
    const test = fixture('storage');
    const failure = await managedSsh(
      test.target,
      test.identity.privateKey,
      `storage-status ${token}`,
      new AbortController().signal,
    ).catch((error) => error);
    expect(failure).toMatchObject({
      failure: 'storage',
      storageDiagnostics: [{ path: '/var/lib', requiredKiB: 180396, availableKiB: 179724 }],
    });
    expect(failure.message).not.toContain('fixture-secret');
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
