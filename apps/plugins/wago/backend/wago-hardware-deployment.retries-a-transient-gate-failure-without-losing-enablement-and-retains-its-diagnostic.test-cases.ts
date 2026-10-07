import { wagoRuntimeBootScript } from './wago-hardware-deployment';
import type { Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope } from './wago-hardware-deployment.spec';
import { join } from 'node:path';
import { WAGO_DOUT } from './wago-hardware-deployment';
import { existsSync } from 'node:fs';
import { renameSync } from 'node:fs';
import { CommissioningProgressReader } from './wago-commissioning-progress';
import { commissioningCheckpoints } from './wago-commissioning-progress';

export function registerRetriesATransientGateFailureWithoutLosingEnablementAndRetainsItsDiagnostic(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('retries a transient gate failure without losing enablement and retains its diagnostic', () => {
    scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
    scope.fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
    scope.fixture.file(
      'etc/rc.d/S99_zz_attraccess_wago',
      `#!/bin/sh
if test ! -f "$FIXTURE_ROOT/first-gate"; then
  touch "$FIXTURE_ROOT/first-gate"
  echo 'host observation timed out' >&2
  exit 124
fi
test -f "$FIXTURE_ROOT/etc/attraccess-wago/runtime-enabled" || exit 99
docker --host unix:///var/run/docker.sock start attraccess-wago >/dev/null
touch "$FIXTURE_ROOT/recovered"
echo started
`,
      0o700,
    );
    scope.fixture.file(
      'bin/sleep',
      `#!/bin/sh
if test -f "$FIXTURE_ROOT/recovered"; then
  rm "$FIXTURE_ROOT/etc/attraccess-wago/runtime-enabled"
else
  echo "$1" >> "$FIXTURE_ROOT/retry-delays"
fi
`,
      0o700,
    );
    const result = scope.fixture.run('set -- supervise\n' + wagoRuntimeBootScript(scope.fixture.root));
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(scope.fixture.read('retry-delays')).toBe('30\n');
    expect(scope.fixture.read('etc/attraccess-wago/supervisor.last-error')).toContain('host observation timed out');
    expect(scope.fixture.read('etc/attraccess-wago/supervisor.last-error')).toContain('exit=124');
    expect(scope.fixture.containers()[0].running).toBe(true);
    const calls = scope.fixture.read('docker.log');
    expect(calls.indexOf('stop attraccess-wago')).toBeLessThan(calls.indexOf('start attraccess-wago'));
  });
}

export function registerRunsExactlyThePreGrantAndPreStartIoScansInACompleteSupervisorCycle(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('runs exactly the pre-grant and pre-start IO scans in a complete supervisor cycle', () => {
    scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
    scope.fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
    const script = wagoRuntimeBootScript(scope.fixture.root)
      .replaceAll('wago_host_io_guard() {', 'wago_host_io_guard() {\nprintf "scan\\n" >> "$FIXTURE_ROOT/gate-order"')
      .replaceAll('chown 10001:10001', 'printf "grant\\n" >> "$FIXTURE_ROOT/gate-order"\nchown 10001:10001');
    const result = scope.fixture.run('set -- cycle\n' + script);
    expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual({
      status: 0,
      stdout: 'running\n',
      stderr: '',
    });
    expect(scope.fixture.read('gate-order').trim().split('\n')).toEqual(['scan', 'grant', 'scan']);
  });
}

export function registerStopsTheExactOwnedPredecessorAndDisablesItsUnsafeRestartBeforeTakeover(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('stops the exact owned predecessor and disables its unsafe restart before takeover', () => {
    scope.fixture.setContainers([
      {
        id: 'old',
        name: 'attraccess-wago',
        running: true,
        restart: 'unless-stopped',
        mounts: [join(scope.fixture.root, WAGO_DOUT)],
      },
    ]);
    expect(scope.prepare().status).toBe(0);
    expect(scope.fixture.containers()[0]).toMatchObject({ running: false, restart: 'no' });
  });
}

export function registerUsesFirmwareInstallActivateAndEnablesTheVendorBootHookWithoutDownloadingBinaries(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('uses firmware install/activate and enables the vendor boot hook without downloading binaries', () => {
    scope.fixture.file('daemon', 'stopped');
    renameSync(
      join(scope.fixture.root, 'etc/rc.d/S99_docker'),
      join(scope.fixture.root, 'etc/rc.d/disabled/S99_docker'),
    );
    expect(scope.report().stdout).toContain('provision=install-vendor-runtime');
    expect(scope.prepare().status).toBe(0);
    expect(scope.fixture.read('vendor.log')).toContain(
      'config_docker install\nconfig_docker activate\ndockerd start\n',
    );
    expect(existsSync(join(scope.fixture.root, 'etc/rc.d/S99_docker'))).toBe(true);
    expect(scope.fixture.read('daemon')).toBe('running');
  });
}

export function registerWaitsForAnActiveSupervisorGateBeforeStartingTheOwnedPreparationJournal(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('waits for an active supervisor gate before starting the owned preparation journal', () => {
    const result = scope.prepare('supervisor-lock-held');
    expect(result.status).toBe(0);
    const progress = jest.fn();
    new CommissioningProgressReader(progress).write(result.stdout);
    expect(progress.mock.calls.map(([checkpoint]) => checkpoint)).toEqual(Object.keys(commissioningCheckpoints));
    expect(existsSync(join(scope.fixture.root, scope.journal, 'started'))).toBe(true);
    expect(result.stderr).not.toContain('Another runtime transaction holds the controller lock');
  });
}

export function registerWaitsForSupervisorReadinessOutsideTheInitialHardwareGateDeadline(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('waits for supervisor readiness outside the initial hardware gate deadline', () => {
    scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
    scope.fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: false, restart: 'no' }]);
    scope.fixture.file(
      'bin/timeout',
      scope.fixture
        .read('bin/timeout')
        .replace(
          'FIXTURE_CALLER_PID:String(process.ppid)',
          "FIXTURE_CALLER_PID:String(process.ppid),FIXTURE_GATE_ACTIVE:process.env.FIXTURE_GATE_ACTIVE || (args[3].endsWith('/S99_zz_attraccess_wago')?'yes':'')",
        ),
      0o700,
    );
    scope.fixture.file(
      'bin/nohup',
      scope.fixture
        .read('bin/nohup')
        .replace(
          'set -eu',
          'set -eu\nif test "${FIXTURE_GATE_ACTIVE:-}" = yes; then touch "$FIXTURE_ROOT/nested-readiness"; exit 1; fi',
        ),
      0o700,
    );
    const result = scope.fixture.run('set -- start\n' + wagoRuntimeBootScript(scope.fixture.root));
    expect(result.status).toBe(0);
    expect(existsSync(join(scope.fixture.root, 'nested-readiness'))).toBe(false);
    expect(scope.fixture.containers()[0].running).toBe(true);
  });
}
