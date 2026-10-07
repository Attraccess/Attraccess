import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExecutableIsolatedManagementShellFixturesTestScope } from './wago-management-shell.spec';
import { chmod } from 'node:fs/promises';
import { symlink } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { MANAGEMENT_INSPECTION_COMMAND } from './wago-management-inspection';
import { parseManagementInspection } from './wago-management-inspection';
import { WagoManagementProvider } from './wago-management-provider';
import { fw31Model } from './fixtures/fw31-identity';
import { fw31OsRelease } from './fixtures/fw31-identity';
import { fw31Revisions } from './fixtures/fw31-identity';
import { assertManagementKey } from './wago-management-key';
import { generateManagementKey } from './wago-management-key';

export function registerACrashBeforeTokenPublicationLeavesNoActiveJournalAndPermitsAFreshPrepare(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('a crash before token publication leaves no active journal and permits a fresh prepare', async () => {
    // Kill the shell immediately after allocating staging, before it can write a token.
    await writeFile(join(scope.bin, 'mktemp'), '#!/bin/sh\n/usr/bin/mktemp "$@"\nkill -KILL "$PPID"\n', {
      mode: 0o700,
    });
    await expect(scope.run('prepare')).rejects.toBeDefined();
    const entries = await readdir(scope.path());
    expect(entries).not.toContain('.attraccess-management-transaction');
    const staging = entries.find((entry) => entry.startsWith('.attraccess-management-staging.'));
    if (!staging) throw new Error('missing staging fixture');
    expect(await readdir(scope.path(staging))).toEqual([]);
    await scope.run('rollback');
    await rm(join(scope.bin, 'mktemp'));
    await scope.run('prepare');
    expect(await readFile(scope.path('.attraccess-management-transaction', 'token'), 'utf8')).toBe(`${scope.token}\n`);
  });
}

export function registerAForeignTransactionAndUnsafePermissionsOrSymlinksCannotOverwriteKeys(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('a foreign transaction and unsafe permissions or symlinks cannot overwrite keys', async () => {
    await scope.prepared();
    await expect(scope.run('install', 180, 'a'.repeat(32))).rejects.toBeDefined();
    await chmod(scope.path('authorized_keys'), 0o644);
    await expect(scope.run('install')).rejects.toBeDefined();
    await rm(scope.path('authorized_keys'));
    const outside = join(scope.root, 'outside');
    await writeFile(outside, 'untouched');
    await symlink(outside, scope.path('authorized_keys'));
    await expect(scope.run('install')).rejects.toBeDefined();
    expect(await readFile(outside, 'utf8')).toBe('untouched');
  });
}

export function registerAddsOnlyTheGeneratedPublicKeyPreservesTheSnapshotAndRestoresExactlyOnExplicitRecovery(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('adds only the generated public key, preserves the snapshot, and restores exactly on explicit recovery', async () => {
    await scope.prepared();
    await scope.run('install');
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toBe(`# existing key\n\n${scope.keyEntry}\n`);
    await scope.run('commit');
    await scope.run('watchdog'); // committed watchdog must leave the key in place
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toContain(scope.key.publicKey);
    await scope.run('rollback');
    await scope.run('rollback');
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toBe('# existing key\n');
    await scope.run('prepare', 180, 'a'.repeat(32)); // recovered transaction permits a new unique key
    expect(await readFile(scope.path(`.attraccess-management-recovered-${scope.token}`, 'recovered'), 'utf8')).toBe('');
    expect(await readFile(scope.path(`.attraccess-management-recovered-${scope.token}`, 'previous'), 'utf8')).toBe(
      '# existing key\n',
    );
  }, 30000);
}

export function registerBoundsWatchdogRetriesAndLeavesRecoveryPossibleAfterExhaustingContention(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('bounds watchdog retries and leaves recovery possible after exhausting contention', async () => {
    await scope.prepared();
    await scope.run('install');
    const flock = await readFile(join(scope.bin, 'flock'));
    await writeFile(join(scope.bin, 'flock'), '#!/bin/sh\necho attempt >> "$HOME/attempts"\nexit 1\n');
    await writeFile(join(scope.bin, 'sleep'), '#!/bin/sh\necho pause >> "$HOME/pauses"\n', { mode: 0o700 });
    await expect(scope.run('watchdog')).rejects.toBeDefined();
    expect((await readFile(join(scope.home, 'attempts'), 'utf8')).trim().split('\n')).toHaveLength(12);
    expect((await readFile(join(scope.home, 'pauses'), 'utf8')).trim().split('\n')).toHaveLength(11);
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toContain(scope.key.publicKey);
    await writeFile(join(scope.bin, 'flock'), flock);
    await rm(join(scope.bin, 'sleep'));
    await writeFile(join(scope.root, 'uptime'), '1180.00 0.00\n');
    await expect(scope.run('commit')).rejects.toBeDefined();
    await scope.run('rollback');
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toBe('# existing key\n');
  }, 30000);
}

export function registerDoesNotAttemptRootProcessExecutableReadsOrExecuteAnInstalledDaemonToInferItsVersion(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('does not attempt root process executable reads or execute an installed daemon to infer its version', async () => {
    const proc = join(scope.root, 'proc'),
      etc = join(scope.root, 'etc');
    await mkdir(etc);
    await writeFile(join(etc, 'os-release'), fw31OsRelease);
    await writeFile(join(etc, 'REVISIONS'), fw31Revisions);
    await mkdir(join(scope.root, 'sys/firmware/devicetree/base'), { recursive: true });
    await writeFile(join(scope.root, 'sys/firmware/devicetree/base/model'), fw31Model);
    for (const pid of ['2', '3']) {
      await mkdir(join(proc, pid), { recursive: true });
      await writeFile(join(proc, pid, 'comm'), 'dropbear\n');
      // Permission-realistic model: no readable executable for a root daemon.
      await symlink('/unreadable-root-daemon-executable', join(proc, pid, 'exe'));
    }
    const script = MANAGEMENT_INSPECTION_COMMAND.replaceAll('/proc/', `${proc}/`)
      .replaceAll('/etc/', `${etc}/`)
      .replaceAll('/sys/', `${join(scope.root, 'sys')}/`);
    expect(script).not.toMatch(/\/exe| -V/);
    const result = await scope.exec('/bin/sh', ['-c', script], { env: scope.env(), timeout: 5000 });
    expect(parseManagementInspection(result.stdout)).toMatchObject({ ssh: 'dropbear', dropbearVersion: 'unknown' });
    // Only the authenticated transport can supply the version of its selected peer.
    const provider = new WagoManagementProvider({ execute: jest.fn(), verifyNewKeyConnection: jest.fn() });
    expect(provider.qualify(parseManagementInspection(result.stdout), 'key_only').support).toBe('UNSUPPORTED');
  });
}

export function registerExecutesTheReadOnlyDetectorOnAFakeProcEtcTreeAndNeverInvokesServiceBinaries(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('executes the read-only detector on a fake proc/etc tree and never invokes service binaries', async () => {
    const proc = join(scope.root, 'proc'),
      etc = join(scope.root, 'etc');
    await mkdir(join(proc, '1'), { recursive: true });
    await mkdir(join(proc, '2'));
    await mkdir(join(proc, 'net'));
    await mkdir(join(etc, 'init.d'), { recursive: true });
    await writeFile(join(etc, 'os-release'), fw31OsRelease);
    await writeFile(join(etc, 'REVISIONS'), fw31Revisions);
    await mkdir(join(scope.root, 'sys/firmware/devicetree/base'), { recursive: true });
    await writeFile(join(scope.root, 'sys/firmware/devicetree/base/model'), fw31Model);
    await writeFile(join(proc, '1', 'comm'), 'init\n');
    await writeFile(join(proc, '2', 'comm'), 'dropbear\n');
    for (const family of ['tcp', 'tcp6', 'udp', 'udp6'])
      await writeFile(
        join(proc, 'net', family),
        `header\n${family === 'tcp' ? '0: 00000000:01BB 00000000:0000 0A\n' : ''}`,
      );
    const command = MANAGEMENT_INSPECTION_COMMAND.replaceAll('/proc/', `${proc}/`)
      .replaceAll('/etc/', `${etc}/`)
      .replaceAll('/sys/', `${join(scope.root, 'sys')}/`);
    const output = await scope.exec('/bin/sh', ['-c', command], { env: scope.env(), timeout: 5000 });
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
    expect(provider.qualify(inspection, 'baseline').support).toBe('UNSUPPORTED');
    expect(provider.qualify(inspection, 'key_only').support).toBe('UNSUPPORTED');
  });
}

export function registerGatesDropbearEnrollmentByLiveVersionFirmwareAndNonRootIdentitySSSS(
  _scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it.each([
    ['31', '2025.88', 'dropbear', 1004, 'supported'],
    ['31', 'unknown', 'dropbear', 1004, 'UNSUPPORTED'],
    ['31', '', 'dropbear', 1004, 'UNSUPPORTED'],
    ['unrecognized', '2025.88', 'dropbear', 1004, 'UNSUPPORTED'],
    ['31', '2025.88', 'dropbear', 0, 'UNSUPPORTED'],
    ['31', '2025.88', 'dropbear\nSSH=openssh', 1004, 'UNSUPPORTED'],
    ['31', '2025.88\nDROPBEAR=unknown', 'dropbear', 1004, 'UNSUPPORTED'],
  ])(
    'gates Dropbear enrollment by live version, firmware and non-root identity (%s/%s/%s/%s)',
    (firmware, version, daemon, uid, support) => {
      const inspection = parseManagementInspection(
        `BEGIN=1\nMODEL=cc100\nFW=${firmware}\nUID=${uid}\nSSH=${daemon}\n${version ? `DROPBEAR=${version}\n` : ''}END=1\n`,
      );
      const provider = new WagoManagementProvider({ execute: jest.fn(), verifyNewKeyConnection: jest.fn() });
      expect(provider.qualify(inspection, 'key_only').support).toBe(support);
      expect(provider.qualify(inspection, 'baseline').support).toBe('UNSUPPORTED');
    },
  );
}

export function registerInMemoryKeysAreUniqueInternallyValidatedAndAcceptedByTheActualLocalOpenSshParser(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('in-memory keys are unique, internally validated and accepted by the actual local OpenSSH parser', async () => {
    const second = generateManagementKey();
    expect(second.fingerprint).not.toBe(scope.key.fingerprint);
    assertManagementKey(second);
    expect(() => assertManagementKey({ ...second, publicKey: scope.key.publicKey })).toThrow('invalid_key');
    // Ephemeral TEST key only, to check interoperability with the installed client. No SSH connection.
    const file = join(scope.root, 'fixture-key');
    await writeFile(file, second.privateKey, { mode: 0o600 });
    const result = await scope.exec('/usr/bin/ssh-keygen', ['-y', '-f', file], { timeout: 5000 });
    expect(result.stdout.trim()).toBe(second.publicKey);
  });
}

export function registerIndependentWatchdogSurvivesTheArmCommandExitingAndRestoresAnUncommittedKey(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('independent watchdog survives the arm command exiting and restores an uncommitted key', async () => {
    await scope.prepared();
    await scope.run('install');
    await rm(scope.path('.attraccess-management-transaction', 'armed'));
    await writeFile(join(scope.root, 'uptime'), '1179.00 0.00\n');
    await scope.run('arm', 300); // Arming must use the existing remaining second, never extend prepare's deadline.
    scope.watchdogPid = Number(
      await readFile(scope.path('.attraccess-management-transaction', 'watchdog-pid'), 'utf8'),
    );
    // Loaded CI runners can delay the detached watchdog chain (nohup, sleep, flock, restore)
    // well beyond local timings; poll generously and exit early on success.
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if ((await readFile(scope.path('authorized_keys'), 'utf8')) === '# existing key\n') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toBe('# existing key\n');
    await expect(scope.run('commit')).rejects.toBeDefined();
  }, 30000);
}

export function registerKillsAnInFlightInstallAtItsRemoteDeadlineAndLeavesItRecoverable(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('kills an in-flight install at its remote deadline and leaves it recoverable', async () => {
    await scope.prepared();
    await writeFile(scope.path('.attraccess-management-transaction', 'deadline'), '100100\n');
    await writeFile(join(scope.bin, 'mv'), '#!/bin/sh\nsleep 2\nexec /bin/mv "$@"\n', { mode: 0o700 });
    await expect(scope.run('install')).rejects.toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toBe('# existing key\n');
    await rm(join(scope.bin, 'mv'));
    await scope.run('rollback');
  }, 10000);
}

export function registerRefusesAnAppendThatWouldOverflowIExistingBytes(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it.each([65536 - Buffer.byteLength(scope.keyEntry) - 1, 65536])(
    'refuses an append that would overflow (%i existing bytes)',
    async (size) => {
      const previous = '#'.repeat(size);
      await writeFile(scope.path('authorized_keys'), previous, { mode: 0o600 });
      await scope.run('prepare');
      await writeFile(scope.path('.attraccess-management-transaction', 'armed'), '');
      await expect(scope.run('install')).rejects.toBeDefined();
      expect(await readFile(scope.path('authorized_keys'), 'utf8')).toBe(previous);
      await scope.run('rollback');
    },
  );
}

export function registerRefusesCommitAfterExpiryEvenWhenTheInstalledImageIsUnchanged(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('refuses commit after expiry even when the installed image is unchanged', async () => {
    await scope.prepared();
    await scope.run('install');
    await writeFile(join(scope.root, 'uptime'), '1180.00 0.00\n');
    await expect(scope.run('commit')).rejects.toBeDefined();
    await scope.run('rollback');
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toBe('# existing key\n');
  });
}
