import type { Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope } from './wago-hardware-deployment.spec';
import { chmodSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { WAGO_DIN } from './wago-hardware-deployment';
import { WAGO_DOUT } from './wago-hardware-deployment';
import { mkdirSync } from 'node:fs';
import { symlinkSync } from 'node:fs';
import { wagoCodesysClassificationShell } from './wago-codesys-classification';
import { rmSync } from 'node:fs';
import { wagoRuntimeBootScript } from './wago-hardware-deployment';
import { lstatSync } from 'node:fs';
import { wagoHardwareDeploymentDockerArgs } from './wago-hardware-deployment';

export function registerActivatesInstalledStoppedDockerDespiteExistingStorageAndPriorWorkloadMetadata(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('activates installed stopped Docker despite existing storage and prior workload metadata', () => {
    scope.fixture.file('daemon', 'stopped');
    scope.fixture.file('home/docker/containers/old/config.v2.json', '{}');
    expect(scope.report().stdout).toContain('docker=installed-stopped');
    expect(scope.prepare().status).toBe(0);
    expect(scope.fixture.read('vendor.log')).not.toContain('config_docker install');
    expect(scope.fixture.read('vendor.log')).toContain('config_docker activate');
  });
}

export function registerAlwaysStopsAndPermanentlyDisablesActiveCodesysBeforeGrantingExactUidPermissions(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('always stops and permanently disables active CODESYS before granting exact UID permissions', () => {
    scope.activePlc();
    chmodSync(join(scope.fixture.root, WAGO_DIN), 0o444);
    chmodSync(join(scope.fixture.root, WAGO_DOUT), 0o666);
    scope.fixture.file('owners.json', '{}');
    expect(scope.report().stdout).toContain('exclusivity=codesys-active');
    expect(scope.prepare().status).toBe(0);
    expect(scope.fixture.read('vendor.log')).toContain(
      'runtime stop 1\nruntime stop 2\nconfig_runtime --wait runtime-version=0 force-new-version=yes restart-server=NO',
    );
    expect(scope.fixture.read('plc')).toBe('stopped');
    expect(scope.fixture.read('etc/specific/rtsversion')).toBe('0');
    expect(existsSync(join(scope.fixture.root, 'etc/rc.d/S98_runtime'))).toBe(false);
    expect(statSync(join(scope.fixture.root, WAGO_DIN)).mode & 0o777).toBe(0o400);
    expect(statSync(join(scope.fixture.root, WAGO_DOUT)).mode & 0o777).toBe(0o600);
    expect(scope.fixture.read(WAGO_DOUT)).toBe('2');
    expect(existsSync(join(scope.fixture.root, scope.journal, 'started'))).toBe(true);
    expect(scope.prepare().status).toBe(0);
  });
}

export function registerBlocksAnUnownedOpenWritableDoutDescriptorBeforeChangingIoPermissions(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('blocks an unowned open writable DOUT descriptor before changing IO permissions', () => {
    scope.fixture.file('proc/99/comm', 'writer\n');
    scope.fixture.file('proc/99/status', 'Uid: 20000 20000 20000 20000\nGid: 20000 20000 20000 20000\nGroups: 20000\n');
    scope.fixture.file('proc/99/stat', '99 (writer) S ' + '0 '.repeat(18) + '999\n');
    scope.fixture.file('proc/99/fdinfo/7', 'flags: 0100001\n');
    mkdirSync(join(scope.fixture.root, 'proc/99/fd'));
    symlinkSync(join(scope.fixture.root, WAGO_DOUT), join(scope.fixture.root, 'proc/99/fd/7'));
    const owners = scope.fixture.read('owners.json');
    expect(
      scope.fixture.run(`root='${scope.fixture.root}'\n${wagoCodesysClassificationShell()}\nwago_codesys_classify`)
        .stdout,
    ).toBe('inactive\n');
    const result = scope.prepare();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unknown');
    expect(scope.fixture.read('owners.json')).toBe(owners);
    expect(existsSync(join(scope.fixture.root, scope.journal, 'started'))).toBe(false);
  });
}

export function registerBlocksRuntimeBootForSEvenIfRunPartsProceeds(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it.each(['active-plc', 'wrong-policy', 'permission-failure', 'missing-register'])(
    'blocks runtime boot for %s even if run-parts proceeds',
    (failure) => {
      expect(scope.prepare().status).toBe(0);
      scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
      scope.fixture.setContainers([
        {
          id: 'new',
          name: 'attraccess-wago',
          running: false,
          restart: failure === 'wrong-policy' ? 'unless-stopped' : 'no',
        },
      ]);
      if (failure === 'active-plc') scope.fixture.file('plc', 'running');
      if (failure === 'missing-register') rmSync(join(scope.fixture.root, WAGO_DOUT));
      expect(
        scope.fixture.run(
          'set -- start\n' + wagoRuntimeBootScript(scope.fixture.root),
          failure === 'permission-failure' ? 'chown-failed' : '',
        ).status,
      ).not.toBe(0);
      expect(scope.fixture.containers()[0].running).toBe(false);
    },
  );
}

export function registerContainsABootStartWhenItsSupervisorCannotAcknowledgeStartup(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('contains a boot start when its supervisor cannot acknowledge startup', () => {
    scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
    scope.fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: false, restart: 'no' }]);
    const result = scope.fixture.run(
      'set -- start\n' + wagoRuntimeBootScript(scope.fixture.root),
      'supervisor-launch-failed',
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Runtime supervisor launch unverified');
    expect(scope.fixture.containers()[0]).toMatchObject({ running: false, restart: 'no' });
  });
}

export function registerContainsASupervisorFailureToExecuteItsGate(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('contains a supervisor failure to execute its gate', () => {
    scope.stopAfterRetry();
    scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
    scope.fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
    scope.fixture.file('etc/rc.d/S99_zz_attraccess_wago', '#!/absent/fixture-interpreter\n', 0o700);
    expect(scope.fixture.run('set -- supervise\n' + wagoRuntimeBootScript(scope.fixture.root)).status).toBe(0);
    expect(existsSync(join(scope.fixture.root, 'retry-enabled'))).toBe(true);
    expect(scope.fixture.read('etc/attraccess-wago/supervisor.last-error')).toContain('exit=');
    expect(scope.fixture.containers()[0].running).toBe(false);
  });
}

export function registerContainsAnAlreadyRunningRuntimeWhenBootObservationFailsS(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it.each(['ps-failed', 'docker-list-failed', 'docker-inspect-failed', 'readlink-failed'])(
    'contains an already running runtime when boot observation fails: %s',
    (fault) => {
      scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
      scope.fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
      expect(scope.fixture.run('set -- start\n' + wagoRuntimeBootScript(scope.fixture.root), fault).status).not.toBe(0);
      expect(scope.fixture.read('docker.log')).toContain('stop attraccess-wago');
      expect(scope.fixture.containers()[0].running).toBe(false);
    },
  );
}

export function registerContainsAnOverallSObservationTimeoutWithoutAcknowledgingReadiness(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it.each(['start', 'supervise'])(
    'contains an overall %s observation timeout without acknowledging readiness',
    (action) => {
      if (action === 'supervise') scope.stopAfterRetry();
      scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
      const request = `etc/attraccess-wago/supervisor-start.${scope.token}`;
      scope.fixture.file(request + '/pending', '');
      scope.fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
      const result = scope.fixture.run(
        `set -- ${action}\n` + wagoRuntimeBootScript(scope.fixture.root),
        'gate-timeout',
      );
      expect(result.status).toBe(action === 'supervise' ? 0 : 124);
      expect(scope.fixture.containers()[0].running).toBe(false);
      expect(existsSync(join(scope.fixture.root, 'etc/attraccess-wago/runtime-enabled'))).toBe(action === 'start');
      if (action === 'supervise') {
        expect(existsSync(join(scope.fixture.root, 'retry-enabled'))).toBe(true);
        expect(scope.fixture.read('etc/attraccess-wago/supervisor.last-error')).toContain('exit=124');
      }
      expect(existsSync(join(scope.fixture.root, request, 'ready'))).toBe(false);
      expect(scope.fixture.read('docker.log')).not.toContain('start attraccess-wago');
    },
  );
}

export function registerContainsLegacyActivationEffectsWithoutRestoringCodesysOrVendorNetworking(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('contains legacy activation effects without restoring CODESYS or vendor networking', () => {
    scope.fixture.file(scope.journal + '/token', scope.token);
    scope.fixture.file(scope.journal + '/prior', 'stopped');
    scope.fixture.file(scope.journal + '/started', '');
    scope.fixture.file(scope.journal + '/start-intent', '');
    expect(scope.recover().status).toBe(0);
    expect(scope.finish().status).toBe(0);
    expect(scope.fixture.read('daemon')).toBe('running');
    expect(existsSync(join(scope.fixture.root, 'vendor.log'))).toBe(false);
  });
}

export function registerContainsThePredecessorBeforeAFailedCodesysStopCanInterruptPreparation(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('contains the predecessor before a failed CODESYS stop can interrupt preparation', () => {
    scope.activePlc();
    scope.fixture.setContainers([{ id: 'old', name: 'attraccess-wago', running: true, restart: 'unless-stopped' }]);
    expect(scope.prepare('codesys-stop-failed').status).not.toBe(0);
    expect(scope.fixture.containers()[0]).toMatchObject({ running: false, restart: 'no' });
    expect(existsSync(join(scope.fixture.root, scope.journal, 'started'))).toBe(false);
  });
}

export function registerCoolsDownAfterFiveConsecutiveCrashStartsWithoutDelegatingARetryToDocker(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('cools down after five consecutive crash starts without delegating a retry to Docker', () => {
    scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
    scope.fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: false, restart: 'no' }]);
    // Exercise the supervisor's counter without repeating six full hardware
    // gates. The real watch gate's refusal to start is checked separately below.
    scope.fixture.file(
      'etc/rc.d/S99_zz_attraccess_wago',
      `#!/bin/sh
set -eu
printf '%s\\n' "$1" >> "$FIXTURE_ROOT/gate-actions"
case "$1" in
  cycle)
    docker --host unix:///var/run/docker.sock start attraccess-wago >/dev/null
    echo started ;;
  watch) echo 'Fixture watch refused restart' >&2; exit 1 ;;
  *) exit 99 ;;
esac
`,
      0o700,
    );
    scope.fixture.file(
      'bin/sleep',
      `#!${process.execPath}
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT;
if(process.argv[2]==='30'){fs.rmSync(root+'/etc/attraccess-wago/runtime-enabled');process.exit(0);}
const state=JSON.parse(fs.readFileSync(root+'/containers.json','utf8'));
state[0].running=false;fs.writeFileSync(root+'/containers.json',JSON.stringify(state));
fs.rmSync(root+'/proc/42',{recursive:true,force:true});
`,
      0o700,
    );
    const result = scope.fixture.run('set -- supervise\n' + wagoRuntimeBootScript(scope.fixture.root));
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(scope.fixture.read('etc/attraccess-wago/supervisor.last-error')).toContain('Fixture watch refused restart');
    expect(scope.fixture.read('gate-actions').trim().split('\n')).toEqual([
      'cycle',
      'cycle',
      'cycle',
      'cycle',
      'cycle',
      'watch',
    ]);
    expect(
      scope.fixture
        .read('docker.log')
        .split('\n')
        .filter((line) => line === 'start attraccess-wago'),
    ).toHaveLength(5);
    expect(scope.fixture.containers()[0]).toMatchObject({ running: false, restart: 'no' });
    expect(existsSync(join(scope.fixture.root, 'etc/attraccess-wago/runtime-enabled'))).toBe(false);
  }, 65000);
}

export function registerDoesNotFollowAPlantedFixedBootStagingSymlink(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('does not follow a planted fixed boot staging symlink', () => {
    scope.fixture.file('unrelated-root-file', 'unchanged');
    symlinkSync(
      join(scope.fixture.root, 'unrelated-root-file'),
      join(scope.fixture.root, 'etc/attraccess-wago/runtime-boot.next'),
    );
    expect(scope.prepare().status).toBe(0);
    expect(scope.fixture.read('unrelated-root-file')).toBe('unchanged');
    expect(lstatSync(join(scope.fixture.root, 'etc/rc.d/S99_zz_attraccess_wago')).isSymbolicLink()).toBe(false);
  });
}

export function registerEmitsUidCapabilitiesHostNetworkingAndOnlyTwoContractedRegisterMounts(
  _scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('emits UID, capabilities, host networking and only two contracted register mounts', () => {
    const args = wagoHardwareDeploymentDockerArgs();
    expect(args).toContain('--user 10001:10001 --cap-drop ALL --security-opt no-new-privileges --network host');
    expect(args).toContain('dst=/run/attraccess-wago/io/din,readonly');
    expect(args).toContain('dst=/run/attraccess-wago/io/dout');
    expect(args).not.toMatch(/--privileged|--device|docker.sock|--user 0/);
    // Optional status LED mounts only expand when preflight found the files.
    expect(args).toContain(
      '${wago_led_green:+--mount "type=bind,src=$wago_led_green,dst=/run/attraccess-wago/io/led-run-green"}',
    );
  });
}
