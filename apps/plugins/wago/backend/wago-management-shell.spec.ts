import { execFile } from 'node:child_process';
import { chmod, lchown, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { assertManagementKey, generateManagementKey } from './wago-management-key';
import { MANAGEMENT_INSPECTION_COMMAND, parseManagementInspection } from './wago-management-inspection';
import { managementKeyCommand, ManagementShellAction } from './wago-management-shell';
import { WagoManagementProvider } from './wago-management-provider';

const exec = promisify(execFile);
// Each case can execute several independently bounded 10-second shell commands.
// Allow their aggregate work while the full checkout's builds/tests run together.
jest.setTimeout(15_000);
const token = '1234567890abcdef1234567890abcdef';
const key = generateManagementKey();
let root: string, home: string, bin: string;
let watchdogPid: number | undefined;
const path = (...parts: string[]) => join(home, '.ssh', ...parts);
const env = () => ({ ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` });
const command = (action: ManagementShellAction, seconds = 180, selectedToken = token) =>
  managementKeyCommand(action, selectedToken, seconds, key.publicKey)
    .replaceAll('/proc/uptime', join(root, 'uptime'))
    .replaceAll('/proc/sys/kernel/random/boot_id', join(root, 'boot-id'));
// Production intentionally rejects root management identities. Root CI runners
// must exercise that same script as an unprivileged owner of only this fixture.
const fixtureIdentity = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {};
async function ownFixture(directory: string): Promise<void> {
  if (!fixtureIdentity.uid) return;
  try {
    const info = await lstat(directory);
    await lchown(directory, fixtureIdentity.uid, fixtureIdentity.gid);
    if (info.isDirectory()) {
      for (const entry of await readdir(directory)) await ownFixture(join(directory, entry));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
const run = async (action: ManagementShellAction, seconds = 180, selectedToken = token) => {
  await ownFixture(root);
  return exec('/bin/sh', ['-c', command(action, seconds, selectedToken)], {
    ...fixtureIdentity,
    env: env(),
    timeout: 10000,
    maxBuffer: 16384,
  });
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'wago-management-fixture-'));
  home = join(root, 'home');
  bin = join(root, 'bin');
  watchdogPid = undefined;
  await mkdir(home, { mode: 0o700 });
  await mkdir(bin, { mode: 0o700 });
  await mkdir(path(), { mode: 0o700 });
  await writeFile(join(root, 'uptime'), '1000.00 0.00\n');
  await writeFile(join(root, 'boot-id'), 'fixture-boot\n');
  // Isolated Linux utility fixtures for macOS. No device/network/system service commands.
  const python = (await exec('/bin/sh', ['-c', 'command -v python3'])).stdout.trim();
  const shim = `#!${python}
import os,sys,stat,fcntl,time,subprocess,signal
name=os.path.basename(sys.argv[0])
if name=='stat':
 s=os.stat(sys.argv[-1]); fmt=sys.argv[2]; print(fmt.replace('%u',str(s.st_uid)).replace('%a',format(stat.S_IMODE(s.st_mode),'o')).replace('%h',str(s.st_nlink)))
elif name=='flock':
 end=time.monotonic()+float(sys.argv[2])
 while True:
  try:
   fcntl.flock(int(sys.argv[-1]),fcntl.LOCK_EX|fcntl.LOCK_NB)
   break
  except BlockingIOError:
   if time.monotonic()>=end:
    with open(os.path.join(os.environ['HOME'],'flock-timeouts'),'a') as log: log.write('timeout\\n')
    sys.exit(1)
   time.sleep(0.02)
elif name=='timeout':
 assert sys.argv[1:3]==['-s','KILL']
 os.setpgid(0,0)
 child=subprocess.Popen(sys.argv[4:],close_fds=False)
 try: sys.exit(child.wait(timeout=float(sys.argv[3])))
 except subprocess.TimeoutExpired: os.killpg(os.getpid(),signal.SIGKILL)
`;
  for (const tool of ['stat', 'flock', 'timeout']) await writeFile(join(bin, tool), shim, { mode: 0o700 });
});
afterEach(async () => {
  if (watchdogPid) {
    try {
      process.kill(watchdogPid, 'SIGTERM');
    } catch {
      /* already completed */
    }
  }
  await rm(root, { recursive: true, force: true });
});

async function prepared() {
  await writeFile(path('authorized_keys'), '# existing key\n', { mode: 0o600 });
  await run('prepare');
  // Most tests inject the independent-watchdog acknowledgement; one below launches the real child.
  await writeFile(path('.attraccess-management-transaction', 'armed'), '');
}

describe('executable isolated management shell fixtures', () => {
  it('adds only the generated public key, preserves the snapshot, and restores exactly on explicit recovery', async () => {
    await prepared();
    await run('install');
    expect(await readFile(path('authorized_keys'), 'utf8')).toBe(`# existing key\n\n${key.publicKey}\n`);
    await run('commit');
    await run('watchdog'); // committed watchdog must leave the key in place
    expect(await readFile(path('authorized_keys'), 'utf8')).toContain(key.publicKey);
    await run('rollback');
    await run('rollback');
    expect(await readFile(path('authorized_keys'), 'utf8')).toBe('# existing key\n');
    await run('prepare', 180, 'a'.repeat(32)); // recovered transaction permits a new unique key
    expect(await readFile(path(`.attraccess-management-recovered-${token}`, 'recovered'), 'utf8')).toBe('');
    expect(await readFile(path(`.attraccess-management-recovered-${token}`, 'previous'), 'utf8')).toBe(
      '# existing key\n',
    );
  }, 10000);

  it('removes a newly created authorized_keys file on rollback', async () => {
    await run('prepare');
    await writeFile(path('.attraccess-management-transaction', 'armed'), '');
    await run('install');
    await run('rollback');
    await expect(readFile(path('authorized_keys'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('retains the journal and refuses rollback when an administrator changes keys concurrently', async () => {
    await prepared();
    await run('install');
    await writeFile(path('authorized_keys'), '# administrator replacement\n', { mode: 0o600 });
    await expect(run('rollback')).rejects.toBeDefined();
    expect(await readFile(path('authorized_keys'), 'utf8')).toBe('# administrator replacement\n');
    expect(await readFile(path('.attraccess-management-transaction', 'previous'), 'utf8')).toBe('# existing key\n');
  });

  it('a foreign transaction and unsafe permissions or symlinks cannot overwrite keys', async () => {
    await prepared();
    await expect(run('install', 180, 'a'.repeat(32))).rejects.toBeDefined();
    await chmod(path('authorized_keys'), 0o644);
    await expect(run('install')).rejects.toBeDefined();
    await rm(path('authorized_keys'));
    const outside = join(root, 'outside');
    await writeFile(outside, 'untouched');
    await symlink(outside, path('authorized_keys'));
    await expect(run('install')).rejects.toBeDefined();
    expect(await readFile(outside, 'utf8')).toBe('untouched');
  });

  it('rollback handles interruption before the key rename', async () => {
    await prepared();
    const tx = path('.attraccess-management-transaction');
    await writeFile(join(tx, 'installed'), '# staged\n');
    await writeFile(join(tx, 'installing'), '');
    await run('rollback');
    expect(await readFile(path('authorized_keys'), 'utf8')).toBe('# existing key\n');
  });

  it('independent watchdog survives the arm command exiting and restores an uncommitted key', async () => {
    await prepared();
    await run('install');
    await rm(path('.attraccess-management-transaction', 'armed'));
    await writeFile(join(root, 'uptime'), '1179.00 0.00\n');
    await run('arm', 300); // Arming must use the existing remaining second, never extend prepare's deadline.
    watchdogPid = Number(await readFile(path('.attraccess-management-transaction', 'watchdog-pid'), 'utf8'));
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if ((await readFile(path('authorized_keys'), 'utf8')) === '# existing key\n') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(await readFile(path('authorized_keys'), 'utf8')).toBe('# existing key\n');
    await expect(run('commit')).rejects.toBeDefined();
  });

  it('retries watchdog lock contention beyond the first five-second wait', async () => {
    await prepared();
    await run('install');
    const holder = exec(
      '/bin/sh',
      ['-c', 'exec 9>>"$HOME/.ssh/.attraccess-management.lock"; flock -w 5 9; touch "$HOME/locked"; sleep 7'],
      { env: env(), timeout: 10000 },
    );
    await waitFor(async () => (await readdir(home)).includes('locked'));
    const watchdog = run('watchdog');
    await waitFor(async () => (await readdir(home)).includes('flock-timeouts'), 6500);
    expect(await readFile(path('authorized_keys'), 'utf8')).toContain(key.publicKey);
    await holder;
    await watchdog;
    expect(await readFile(path('authorized_keys'), 'utf8')).toBe('# existing key\n');
    await expect(run('install')).rejects.toBeDefined();
  }, 15000);

  it('reserves append space and rolls back an installed image of exactly 65536 bytes', async () => {
    const previous = '#'.repeat(65536 - Buffer.byteLength(key.publicKey) - 2);
    await writeFile(path('authorized_keys'), previous, { mode: 0o600 });
    await run('prepare');
    await writeFile(path('.attraccess-management-transaction', 'armed'), '');
    await run('install');
    expect((await readFile(path('authorized_keys'))).length).toBe(65536);
    await run('commit');
    await run('rollback');
    expect(await readFile(path('authorized_keys'), 'utf8')).toBe(previous);
  });

  it.each([65536 - Buffer.byteLength(key.publicKey) - 1, 65536])(
    'refuses an append that would overflow (%i existing bytes)',
    async (size) => {
      const previous = '#'.repeat(size);
      await writeFile(path('authorized_keys'), previous, { mode: 0o600 });
      await run('prepare');
      await writeFile(path('.attraccess-management-transaction', 'armed'), '');
      await expect(run('install')).rejects.toBeDefined();
      expect(await readFile(path('authorized_keys'), 'utf8')).toBe(previous);
      await run('rollback');
    },
  );

  it('a crash before token publication leaves no active journal and permits a fresh prepare', async () => {
    // Kill the shell immediately after allocating staging, before it can write a token.
    await writeFile(join(bin, 'mktemp'), '#!/bin/sh\n/usr/bin/mktemp "$@"\nkill -KILL "$PPID"\n', { mode: 0o700 });
    await expect(run('prepare')).rejects.toBeDefined();
    const entries = await readdir(path());
    expect(entries).not.toContain('.attraccess-management-transaction');
    const staging = entries.find((entry) => entry.startsWith('.attraccess-management-staging.'));
    if (!staging) throw new Error('missing staging fixture');
    expect(await readdir(path(staging))).toEqual([]);
    await run('rollback');
    await rm(join(bin, 'mktemp'));
    await run('prepare');
    expect(await readFile(path('.attraccess-management-transaction', 'token'), 'utf8')).toBe(`${token}\n`);
  });

  it('rejects apply, commit and rearming after the persisted deadline even without a watchdog', async () => {
    await prepared();
    await writeFile(join(root, 'uptime'), '1180.00 0.00\n');
    await expect(run('install', 300)).rejects.toBeDefined();
    await expect(run('commit', 300)).rejects.toBeDefined();
    await expect(run('arm', 300)).rejects.toBeDefined();
    expect(await readFile(path('authorized_keys'), 'utf8')).toBe('# existing key\n');
    await run('rollback');
  });

  it('refuses an old deadline after a controller reboot', async () => {
    await prepared();
    await writeFile(join(root, 'boot-id'), 'new-boot\n');
    await expect(run('install')).rejects.toBeDefined();
    await run('rollback');
  });

  it('refuses commit after expiry even when the installed image is unchanged', async () => {
    await prepared();
    await run('install');
    await writeFile(join(root, 'uptime'), '1180.00 0.00\n');
    await expect(run('commit')).rejects.toBeDefined();
    await run('rollback');
    expect(await readFile(path('authorized_keys'), 'utf8')).toBe('# existing key\n');
  });

  it('bounds watchdog retries and leaves recovery possible after exhausting contention', async () => {
    await prepared();
    await run('install');
    const flock = await readFile(join(bin, 'flock'));
    await writeFile(join(bin, 'flock'), '#!/bin/sh\necho attempt >> "$HOME/attempts"\nexit 1\n');
    await writeFile(join(bin, 'sleep'), '#!/bin/sh\necho pause >> "$HOME/pauses"\n', { mode: 0o700 });
    await expect(run('watchdog')).rejects.toBeDefined();
    expect((await readFile(join(home, 'attempts'), 'utf8')).trim().split('\n')).toHaveLength(12);
    expect((await readFile(join(home, 'pauses'), 'utf8')).trim().split('\n')).toHaveLength(11);
    expect(await readFile(path('authorized_keys'), 'utf8')).toContain(key.publicKey);
    await writeFile(join(bin, 'flock'), flock);
    await rm(join(bin, 'sleep'));
    await writeFile(join(root, 'uptime'), '1180.00 0.00\n');
    await expect(run('commit')).rejects.toBeDefined();
    await run('rollback');
    expect(await readFile(path('authorized_keys'), 'utf8')).toBe('# existing key\n');
  }, 10000);

  it('kills an in-flight install at its remote deadline and leaves it recoverable', async () => {
    await prepared();
    await writeFile(path('.attraccess-management-transaction', 'deadline'), '100100\n');
    await writeFile(join(bin, 'mv'), '#!/bin/sh\nsleep 2\nexec /bin/mv "$@"\n', { mode: 0o700 });
    await expect(run('install')).rejects.toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await readFile(path('authorized_keys'), 'utf8')).toBe('# existing key\n');
    await rm(join(bin, 'mv'));
    await run('rollback');
  }, 10000);

  it('rejects shell-injection keys, tokens and arbitrary actions before execution', () => {
    expect(() => managementKeyCommand('install', token, 180, `${key.publicKey}\ncommand`)).toThrow('invalid_key');
    expect(() => managementKeyCommand('prepare', "';touch /tmp/pwn")).toThrow('invalid_transaction');
    expect(() => managementKeyCommand('custom' as never, token)).toThrow('invalid_action');
  });

  it('in-memory keys are unique, internally validated and accepted by the actual local OpenSSH parser', async () => {
    const second = generateManagementKey();
    expect(second.fingerprint).not.toBe(key.fingerprint);
    assertManagementKey(second);
    expect(() => assertManagementKey({ ...second, publicKey: key.publicKey })).toThrow('invalid_key');
    // Ephemeral TEST key only, to check interoperability with the installed client. No SSH connection.
    const file = join(root, 'fixture-key');
    await writeFile(file, second.privateKey, { mode: 0o600 });
    const result = await exec('/usr/bin/ssh-keygen', ['-y', '-f', file], { timeout: 5000 });
    expect(result.stdout.trim()).toBe(second.publicKey);
  });

  it('executes the read-only detector on a fake proc/etc tree and never invokes service binaries', async () => {
    const proc = join(root, 'proc'),
      etc = join(root, 'etc');
    await mkdir(join(proc, '1'), { recursive: true });
    await mkdir(join(proc, '2'));
    await mkdir(join(proc, 'net'));
    await mkdir(join(etc, 'init.d'), { recursive: true });
    await writeFile(join(etc, 'os-release'), 'NAME="WAGO CC100"\nVERSION_ID="4.9.1(31)"\n');
    await writeFile(join(proc, '1', 'comm'), 'init\n');
    await writeFile(join(proc, '2', 'comm'), 'dropbear\n');
    for (const family of ['tcp', 'tcp6', 'udp', 'udp6'])
      await writeFile(
        join(proc, 'net', family),
        `header\n${family === 'tcp' ? '0: 00000000:01BB 00000000:0000 0A\n' : ''}`,
      );
    const command = MANAGEMENT_INSPECTION_COMMAND.replaceAll('/proc/', `${proc}/`).replaceAll('/etc/', `${etc}/`);
    const output = await exec('/bin/sh', ['-c', command], { env: env(), timeout: 5000 });
    const inspection = parseManagementInspection(output.stdout);
    expect(inspection).toMatchObject({
      model: 'cc100',
      firmware: '31',
      ssh: 'dropbear',
      serviceControl: 'sysv',
      wbm: 'listening',
      otherManagement: 'not_observed',
    });
    expect(output.stdout).not.toContain('00000000');
    const provider = new WagoManagementProvider({ execute: jest.fn(), verifyNewKeyConnection: jest.fn() });
    expect(provider.qualify(inspection, 'baseline').support).toBe('qualification_required');
    expect(provider.qualify(inspection, 'key_only').support).toBe('qualification_required');
  });

  it('reports mixed/unknown daemons and BSP-only firmware conservatively; rejects oversized/raw output', () => {
    const inspection = parseManagementInspection('BEGIN=1\nFW=bsp_only\nUID=1004\nSSH=openssh\nSSH=dropbear\nEND=1\n');
    expect(inspection).toMatchObject({ firmware: 'unknown', ssh: 'mixed', wbm: 'unknown', serviceControl: 'unknown' });
    expect(() => parseManagementInspection(`BEGIN=1\n${'secret'.repeat(5000)}\nEND=1\n`)).toThrow('inspection_failed');
    expect(() => parseManagementInspection('BEGIN=1\nPASSWORD=secret\nEND=1\n')).toThrow('inspection_failed');
  });
});

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('fixture wait timed out');
}
