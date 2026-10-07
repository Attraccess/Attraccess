import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExecutableIsolatedManagementShellFixturesTestScope } from './wago-management-shell.spec';
import { readdir } from 'node:fs/promises';

export function registerRejectsApplyCommitAndRearmingAfterThePersistedDeadlineEvenWithoutAWatchdog(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('rejects apply, commit and rearming after the persisted deadline even without a watchdog', async () => {
    await scope.prepared();
    await writeFile(join(scope.root, 'uptime'), '1180.00 0.00\n');
    await expect(scope.run('install', 300)).rejects.toBeDefined();
    await expect(scope.run('commit', 300)).rejects.toBeDefined();
    await expect(scope.run('arm', 300)).rejects.toBeDefined();
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toBe('# existing key\n');
    await scope.run('rollback');
  });
}

export function registerRemovesANewlyCreatedAuthorizedKeysFileOnRollback(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('removes a newly created authorized_keys file on rollback', async () => {
    await scope.run('prepare');
    await writeFile(scope.path('.attraccess-management-transaction', 'armed'), '');
    await scope.run('install');
    await scope.run('rollback');
    await expect(readFile(scope.path('authorized_keys'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
}

export function registerReservesAppendSpaceAndRollsBackAnInstalledImageOfExactly65536Bytes(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('reserves append space and rolls back an installed image of exactly 65536 bytes', async () => {
    const previous = '#'.repeat(65536 - Buffer.byteLength(scope.keyEntry) - 2);
    await writeFile(scope.path('authorized_keys'), previous, { mode: 0o600 });
    await scope.run('prepare');
    await writeFile(scope.path('.attraccess-management-transaction', 'armed'), '');
    await scope.run('install');
    expect((await readFile(scope.path('authorized_keys'))).length).toBe(65536);
    await scope.run('commit');
    await scope.run('rollback');
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toBe(previous);
  });
}

export function registerRetainsTheJournalAndRefusesRollbackWhenAnAdministratorChangesKeysConcurrently(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('retains the journal and refuses rollback when an administrator changes keys concurrently', async () => {
    await scope.prepared();
    await scope.run('install');
    await writeFile(scope.path('authorized_keys'), '# administrator replacement\n', { mode: 0o600 });
    await expect(scope.run('rollback')).rejects.toBeDefined();
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toBe('# administrator replacement\n');
    expect(await readFile(scope.path('.attraccess-management-transaction', 'previous'), 'utf8')).toBe(
      '# existing key\n',
    );
  });
}

export function registerRetriesWatchdogLockContentionBeyondTheFirstFiveSecondWait(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('retries watchdog lock contention beyond the first five-second wait', async () => {
    await scope.prepared();
    await scope.run('install');
    const holder = scope.exec(
      '/bin/sh',
      ['-c', 'exec 9>>"$HOME/.ssh/.attraccess-management.lock"; flock -w 5 9; touch "$HOME/locked"; sleep 7'],
      { env: scope.env(), timeout: 10000 },
    );
    await scope.waitFor(async () => (await readdir(scope.home)).includes('locked'));
    const watchdog = scope.run('watchdog');
    await scope.waitFor(async () => (await readdir(scope.home)).includes('flock-timeouts'), 6500);
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toContain(scope.key.publicKey);
    await holder;
    await watchdog;
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toBe('# existing key\n');
    await expect(scope.run('install')).rejects.toBeDefined();
  }, 15000);
}

export function registerRollbackHandlesInterruptionBeforeTheKeyRename(
  scope: ExecutableIsolatedManagementShellFixturesTestScope,
): void {
  it('rollback handles interruption before the key rename', async () => {
    await scope.prepared();
    const tx = scope.path('.attraccess-management-transaction');
    await writeFile(join(tx, 'installed'), '# staged\n');
    await writeFile(join(tx, 'installing'), '');
    await scope.run('rollback');
    expect(await readFile(scope.path('authorized_keys'), 'utf8')).toBe('# existing key\n');
  });
}
