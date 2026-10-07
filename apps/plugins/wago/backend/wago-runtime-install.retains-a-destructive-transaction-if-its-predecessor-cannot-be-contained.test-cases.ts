import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope } from './wago-runtime-install.spec';
import { runtimeBundleAcceptScript } from './wago-runtime-install';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { runtimeBundleRecoveryScript } from './wago-runtime-install';
import { runtimeBundleRecoveryAcknowledgementScript } from './wago-runtime-install';

export function registerRetainsADestructiveTransactionIfItsPredecessorCannotBeContained(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('retains a destructive transaction if its predecessor cannot be contained', () => {
    scope.prior();
    expect(scope.install('update-failed').status).not.toBe(0);
    expect(scope.fixture.containers()[0].running).toBe(true);
    expect(existsSync(join(scope.fixture.root, scope.tx, 'recovering'))).toBe(true);
    expect(existsSync(join(scope.fixture.root, scope.tx + '.restored'))).toBe(false);
    expect(scope.recover().status).toBe(0);
    expect(scope.fixture.containers()).toEqual([]);
  });
}

export function registerRetainsAnUnfinishedTransactionWhenItsRuntimeIsStopped(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('retains an unfinished transaction when its runtime is stopped', () => {
    expect(scope.install().status).toBe(0);
    scope.fixture.setContainers(scope.fixture.containers().map((container) => ({ ...container, running: false })));
    const result = scope.fixture.run(runtimeBundleAcceptScript(scope.fixture.root));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Runtime is not running');
    expect(existsSync(join(scope.fixture.root, scope.tx, 'started'))).toBe(true);
    expect(existsSync(join(scope.fixture.root, scope.tx, 'accepting'))).toBe(false);
  });
}

export function registerRetainsInterruptedExecutionUntilExplicitCleanupAndNeverRestartsThePredecessor(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('retains interrupted execution until explicit cleanup and never restarts the predecessor', () => {
    scope.prior();
    expect(scope.install('kill').signal).toBe('SIGKILL');
    expect(existsSync(join(scope.fixture.root, scope.tx, 'new-container'))).toBe(true);
    expect(scope.recover().status).toBe(0);
    expect(scope.fixture.containers()).toEqual([]);
    expect(existsSync(join(scope.fixture.root, scope.tx + '.restored'))).toBe(true);
    expect(scope.recover().status).toBe(0);
  });
}

export function registerRetainsRecoveryOwnershipOnSInsteadOfClaimingContainment(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it.each(['stop-failed', 'stop-stuck', 'remove-stuck', 'update-failed', 'docker-inspect-failed'])(
    'retains recovery ownership on %s instead of claiming containment',
    (fault) => {
      expect(scope.install().status).toBe(0);
      expect(scope.recover(fault).status).not.toBe(0);
      expect(scope.fixture.containers()).toHaveLength(1);
      expect(existsSync(join(scope.fixture.root, scope.tx + '.restored'))).toBe(false);
      expect(scope.recover().status).toBe(0);
    },
  );
}

export function registerRetainsRecoveryOwnershipWhenTheDaemonIsUnavailableWhileItsContainerSurvives(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('retains recovery ownership when the daemon is unavailable while its container survives', () => {
    expect(scope.install().status).toBe(0);
    scope.fixture.file('daemon', 'stopped');
    expect(scope.recover().status).not.toBe(0);
    expect(scope.fixture.containers()[0].running).toBe(true);
    expect(existsSync(join(scope.fixture.root, scope.tx, 'recovering'))).toBe(true);
    expect(existsSync(join(scope.fixture.root, scope.tx + '.restored'))).toBe(false);
    scope.fixture.file('daemon', 'running');
    expect(scope.recover().status).toBe(0);
    expect(scope.fixture.containers()).toEqual([]);
  });
}

export function registerRetainsTheRecoveryJournalIfDockerRemovalFailsThenResumesCleanupSafely(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('retains the recovery journal if Docker removal fails, then resumes cleanup safely', () => {
    expect(scope.install().status).toBe(0);
    expect(scope.recover('remove').status).not.toBe(0);
    expect(existsSync(join(scope.fixture.root, scope.tx, 'recovering'))).toBe(true);
    expect(scope.fixture.run(runtimeBundleAcceptScript(scope.fixture.root)).status).not.toBe(0);
    expect(scope.recover().status).toBe(0);
    expect(scope.recover().status).toBe(0);
  });
}

export function registerSerializesDeliveryWhileAStreamIsStillReceivingBytesUsingRealFlock(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('serializes delivery while a stream is still receiving bytes using real flock', async () => {
    rmSync(join(scope.fixture.root, scope.config, 'runtime.env.next'));
    scope.fixture.file(
      'bin/flock',
      `#!${process.env.PYTHON || '/usr/bin/python3'}\nimport fcntl,sys\nflags=fcntl.LOCK_EX|(fcntl.LOCK_NB if '-n' in sys.argv else 0)\ntry: fcntl.flock(int(sys.argv[-1]),flags)\nexcept OSError: sys.exit(1)\n`,
      0o700,
    );
    const { bundle, script } = scope.delivery();
    const deliveryScript = 'tmp/delivery.sh';
    scope.fixture.file(deliveryScript, script, 0o700);
    const child = spawn('/bin/sh', [join(scope.fixture.root, deliveryScript)], {
      env: {
        PATH: join(scope.fixture.root, 'bin'),
        FIXTURE_ROOT: scope.fixture.root,
        TMPDIR: join(scope.fixture.root, 'tmp'),
      },
    });
    child.stdout.resume();
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    const completion = new Promise<number | null>((resolve) => child.on('close', resolve));
    try {
      for (
        let attempt = 0;
        attempt < 1500 &&
        !existsSync(join(scope.fixture.root, scope.config, 'delivery/token')) &&
        child.exitCode === null;
        attempt++
      )
        await new Promise((resolve) => setTimeout(resolve, 20));
      if (!existsSync(join(scope.fixture.root, scope.config, 'delivery/token')))
        throw new Error(`Delivery did not reach the locked receiving phase: ${stderr}`);
      // Simulate the deadline while the real upload still owns its flock.
      expect(
        scope.fixture.run(runtimeBundleRecoveryScript(scope.fixture.root, scope.token), 'lock-wait-expired').stderr,
      ).toContain('lock');
      child.stdin.end(bundle);
      expect(await completion).toBe(0);
    } finally {
      child.stdin.destroy();
      if (child.exitCode === null) child.kill('SIGKILL');
      await completion;
    }
  }, 35000);
}

export function registerStillBoundsAStalledImageImportAndContainsTheFailedInstallation(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('still bounds a stalled image import and contains the failed installation', () => {
    scope.prior();
    scope.fixture.file('docker-load-seconds', '1200');
    const result = scope.install();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Runtime image load failed or exceeded 300 seconds');
    expect(scope.fixture.containers()).toEqual([]);
    expect(existsSync(join(scope.fixture.root, scope.config, 'runtime-enabled'))).toBe(false);
    expect(existsSync(join(scope.fixture.root, scope.data))).toBe(false);
  });
}

export function registerStreamsTheExactAuthenticatedBundleWithTokenOwnershipAndPrivateStagedCredentials(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('streams the exact authenticated bundle with token ownership and private staged credentials', () => {
    rmSync(join(scope.fixture.root, scope.config, 'runtime.env.next'));
    scope.fixture.file(scope.config + '/docker-provision/token', scope.token);
    scope.fixture.file(scope.config + '/docker-provision/mode', 'destructive');
    scope.fixture.file(scope.config + '/docker-provision/started', '');
    const { bundle, script } = scope.delivery();
    expect(scope.fixture.run(script, '', bundle).status).toBe(0);
    expect(scope.fixture.read(scope.tx + '/token')).toBe(scope.token + '\n');
    expect(scope.fixture.read(scope.config + '/runtime-ca.pem')).toBe('public CA');
    expect(scope.fixture.run(runtimeBundleRecoveryScript(scope.fixture.root, 'b'.repeat(32))).status).not.toBe(0);
    expect(scope.fixture.run(runtimeBundleRecoveryScript(scope.fixture.root, scope.token)).status).toBe(0);
    expect(scope.fixture.run(runtimeBundleRecoveryAcknowledgementScript(scope.fixture.root, scope.token)).status).toBe(
      0,
    );
    expect(existsSync(join(scope.fixture.root, scope.tx + '.restored'))).toBe(false);
  });
}

export function registerWaitsForAnActiveRuntimeMonitorBeforeCleaningUpItsRetainedInstallation(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('waits for an active runtime monitor before cleaning up its retained installation', async () => {
    expect(scope.install().status).toBe(0);
    scope.fixture.file(
      'bin/flock',
      `#!${process.env.PYTHON || '/usr/bin/python3'}\nimport fcntl,sys,os\nopen(os.environ['FIXTURE_ROOT']+'/recovery-lock-attempt','w').close()\nflags=fcntl.LOCK_EX|(fcntl.LOCK_NB if '-n' in sys.argv else 0)\ntry: fcntl.flock(int(sys.argv[-1]),flags)\nexcept OSError: sys.exit(1)\n`,
      0o700,
    );
    const holder = spawn(process.env.PYTHON || '/usr/bin/python3', [
      '-c',
      'import fcntl,sys,time,os; f=open(sys.argv[1],"r+"); fcntl.flock(f,fcntl.LOCK_EX); print("locked",flush=True)\nwhile not os.path.exists(sys.argv[2]): time.sleep(0.01)\ntime.sleep(0.5)',
      join(scope.fixture.root, scope.config, 'install.lock'),
      join(scope.fixture.root, 'recovery-lock-attempt'),
    ]);
    const completion = new Promise<void>((resolve) => holder.on('close', () => resolve()));
    try {
      await new Promise<void>((resolve, reject) => {
        holder.stdout.once('data', () => resolve());
        holder.once('error', reject);
      });
      const result = scope.recover();
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      expect(scope.fixture.containers()).toEqual([]);
      expect(existsSync(join(scope.fixture.root, scope.tx))).toBe(false);
      expect(existsSync(join(scope.fixture.root, scope.config, 'install.lock'))).toBe(true);
    } finally {
      if (holder.exitCode === null) holder.kill();
      await completion;
    }
  }, 30000);
}
