import { existsSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { WAGO_DOUT } from './wago-hardware-deployment';
import type { ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope } from './wago-runtime-install-storage.spec';
import { runtimeUpdateCapacityPreflightScript } from './wago-runtime-install';
import { runtimeBundleCapacityPreflightScript } from './wago-runtime-install';
import { runtimeBundleStagingCapacityPreflightScript } from './wago-runtime-install';

export function registerAdmitsTheReportedRootHomeCapacitiesWithoutNeedingPreparedIoOrInactiveCodesys(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it('admits the reported root/home capacities without needing prepared IO or inactive CODESYS', () => {
    scope.fixture.file('plc', 'running');
    rmSync(join(scope.fixture.root, WAGO_DOUT));
    rmSync(join(scope.fixture.root, 'etc/rc.d/S99_zz_attraccess_wago'));
    expect(scope.run().status).toBe(0);
    expect(existsSync(join(scope.fixture.root, 'etc/attraccess-wago/install.lock'))).toBe(false);
    expect(existsSync(join(scope.fixture.root, 'etc/attraccess-wago/delivery'))).toBe(false);
    expect(existsSync(join(scope.fixture.root, 'vendor.log'))).toBe(false);
  });
}

export function registerBudgetsOneUpdateArchiveAndDockerReserveOnlyOnTheirActualFilesystems(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it('budgets one update archive and Docker reserve only on their actual filesystems', () => {
    scope.layout([1, 2, 3, 4], [0, 0, scope.b + scope.reserve, 3 * scope.b + scope.reserve]);
    const update = () => scope.fixture.run(runtimeUpdateCapacityPreflightScript(scope.bytes, scope.fixture.root));
    expect(update().status).toBe(0);
    scope.layout([1, 2, 3, 4], [0, 0, scope.b + scope.reserve - 1, 3 * scope.b + scope.reserve]);
    expect(update().stderr).toContain(
      `/var/lib requires ${scope.b + scope.reserve} KiB, available ${scope.b + scope.reserve - 1} KiB`,
    );
    scope.layout([1, 2, 3, 4], [0, 0, scope.b + scope.reserve, 3 * scope.b + scope.reserve - 1]);
    expect(update().stderr).toContain(`/home requires ${3 * scope.b + scope.reserve} KiB`);
    scope.layout([1, 2, 3, 3], [0, 0, 4 * scope.b + scope.reserve - 1, 4 * scope.b + scope.reserve - 1]);
    expect(update().status).not.toBe(0);
    scope.layout([1, 2, 3, 3], [0, 0, 4 * scope.b + scope.reserve, 4 * scope.b + scope.reserve]);
    expect(update().status).toBe(0);
  });
}

export function registerBudgetsTwoMoveCopiesOnEqualDeviceBindMounts(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it.each([scope.run, scope.runStaging])('budgets two move copies on equal-device bind mounts', (check) => {
    scope.layout(
      [1, 1, 2, 3],
      [2 * scope.b + scope.reserve, 2 * scope.b + scope.reserve, scope.b + scope.reserve, 3 * scope.b + scope.reserve],
    );
    expect(check().status).toBe(0);
    scope.layout(
      [1, 1, 2, 3],
      [
        2 * scope.b + scope.reserve - 1,
        2 * scope.b + scope.reserve - 1,
        scope.b + scope.reserve,
        3 * scope.b + scope.reserve,
      ],
    );
    expect(check().stderr).toContain('Insufficient runtime storage');
    expect(check().status).not.toBe(0);
  });
}

export function registerChecksUnpreparedStagingWithInactiveDockerWithoutQueryingOrActivatingIt(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it('checks unprepared staging with inactive Docker without querying or activating it', () => {
    scope.fixture.file('daemon', 'stopped');
    scope.fixture.file('plc', 'running');
    rmSync(join(scope.fixture.root, 'etc/attraccess-wago'), { recursive: true });
    expect(scope.runStaging().status).toBe(0);
    expect(existsSync(join(scope.fixture.root, 'docker.log'))).toBe(false);
    expect(existsSync(join(scope.fixture.root, 'vendor.log'))).toBe(false);
    expect(existsSync(join(scope.fixture.root, 'etc/attraccess-wago'))).toBe(false);
    expect(scope.fixture.read('daemon')).toBe('stopped');
    expect(scope.fixture.read('plc')).toBe('running');
    expect(scope.run().status).not.toBe(0);
  });
}

export function registerDoesNotMaskAFailingDfWithOtherwiseValidOutput(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it('does not mask a failing df with otherwise valid output', () => {
    scope.fixture.file(
      'bin/df',
      `#!${process.execPath}\nconsole.log(${JSON.stringify(scope.dfHeader + 'fixture 999999 0 999999 0% /')});process.exit(1);`,
      0o700,
    );
    expect(scope.run().stderr).toContain('Cannot read storage capacity');
  });
}

export function registerFailsClosedForInvalidDfOutputJ(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it.each([
    '',
    'fixture 999999 0 999999',
    scope.dfHeader,
    scope.dfHeader + 'fixture 999 0 nope 0% /',
    scope.dfHeader + 'fixture 999 0 -1 0% /',
    scope.dfHeader + 'fixture 999 0 1000 0% /',
    scope.dfHeader + 'fixture 999 0 999 0% /\nextra',
  ])('fails closed for invalid df output %j', (output) => {
    scope.fixture.file('bin/df', `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(output)});`, 0o700);
    expect(scope.run().stderr).toContain('Invalid df output');
    expect(scope.run().status).not.toBe(0);
  });
}

export function registerFailsClosedOnUnknownFilesystemIdentityMissingToolsAndUnavailableDocker(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it('fails closed on unknown filesystem identity, missing tools and unavailable Docker', () => {
    scope.fixture.file('bin/stat', '#!/bin/sh\nprintf "unknown\\n"\n', 0o700);
    expect(scope.run().stderr).toContain('Cannot identify storage filesystem');
    scope.fixture.file('bin/docker', '#!/bin/sh\nexit 1\n', 0o700);
    expect(scope.run().status).not.toBe(0);
    rmSync(join(scope.fixture.root, 'bin/flock'));
    expect(scope.run().stderr).toContain('Runtime tool unavailable: flock');
  });
}

export function registerRechecksDockerAdmissionAndSharedStagingCapacityAfterActivation(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it('rechecks Docker admission and shared staging capacity after activation', () => {
    scope.fixture.file('daemon', 'stopped');
    scope.layout([1, 1, 1, 1], Array(4).fill(2 * scope.b + scope.reserve));
    expect(scope.runStaging().status).toBe(0);
    scope.fixture.file('daemon', 'running');
    expect(scope.run().stderr).toContain('Insufficient runtime storage');
    expect(scope.run().status).not.toBe(0);
    scope.layout([1, 1, 1, 1], Array(4).fill(5 * scope.b + scope.reserve));
    expect(scope.run().status).toBe(0);
  });
}

export function registerRejectsInsufficientEarlyStagingAtPathIndexSWithInactiveDocker(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it.each([0, 1, 2])('rejects insufficient early staging at path index %s with inactive Docker', (index) => {
    scope.fixture.file('daemon', 'stopped');
    const free = [scope.b + scope.reserve, scope.b + scope.reserve, scope.b + scope.reserve, 999999];
    free[index]--;
    scope.layout([1, 2, 3, 4], free);
    expect(scope.runStaging().stderr).toContain('Insufficient runtime storage');
    expect(scope.runStaging().status).not.toBe(0);
    expect(existsSync(join(scope.fixture.root, 'docker.log'))).toBe(false);
  });
}

export function registerRejectsInsufficientSCapacity(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it.each([
    [
      'root',
      [1, 1, 1, 2],
      [2 * scope.b + scope.reserve - 1, 2 * scope.b + scope.reserve - 1, 2 * scope.b + scope.reserve - 1, 999999],
    ],
    ['tmp', [1, 2, 3, 4], [999999, scope.b + scope.reserve - 1, 999999, 999999]],
    ['varlib', [1, 2, 3, 4], [999999, 999999, scope.b + scope.reserve - 1, 999999]],
    ['upload', [1, 2, 3, 4], [scope.b + scope.reserve - 1, 999999, 999999, 999999]],
    ['docker', [1, 2, 3, 4], [999999, 999999, 999999, 3 * scope.b + scope.reserve - 1]],
  ])('rejects insufficient %s capacity', (_name, devices, free) => {
    scope.layout(devices as number[], free as number[]);
    expect(scope.run().stderr).toContain('Insufficient runtime storage');
    expect(scope.run().status).not.toBe(0);
  });
}

export function registerRejectsInvalidByteSizeS(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it.each([0, -1, NaN, Infinity, 1.5, 512 * scope.mib + 1, Number.MAX_SAFE_INTEGER])(
    'rejects invalid byte size %s',
    (size) => {
      expect(() => runtimeBundleCapacityPreflightScript(size)).toThrow('Invalid bundle size');
      expect(() => runtimeBundleStagingCapacityPreflightScript(size)).toThrow('Invalid bundle size');
    },
  );
}

export function registerRejectsMalformedNativeIdentityJInBothStandaloneChecks(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it.each(['1', '1:bad', '1:2:3', '01:2', '1:18446744073709551616', '1:2\n1:2'])(
    'rejects malformed native identity %j in both standalone checks',
    (identity) => {
      scope.fixture.file(
        'bin/stat',
        `#!${process.execPath}\nconst args=process.argv.slice(2);console.log(args[0]==='-c'&&args[1]==='%u:%g:%a'&&args[2]==='/'?'0:0:700':${JSON.stringify(identity)});`,
        0o700,
      );
      expect(scope.run().stderr).toContain('Cannot identify storage filesystem');
      expect(scope.runStaging().stderr).toContain('Cannot identify storage filesystem');
    },
  );
}

export function registerRequiresStagingToolsEarlyButNeitherADockerBinaryNorDaemonInfo(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it('requires staging tools early but neither a Docker binary nor daemon info', () => {
    rmSync(join(scope.fixture.root, 'bin/docker'));
    expect(scope.runStaging().status).toBe(0);
    rmSync(join(scope.fixture.root, 'bin/mv'));
    expect(scope.runStaging().stderr).toContain('Runtime tool unavailable: mv');
    expect(scope.runStaging().status).not.toBe(0);
  });
}

export function registerUsesTheDiscoveredDockerRootRatherThanAssumingHome(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it('uses the discovered Docker root rather than assuming home', () => {
    scope.fixture.file('alternate-docker/data', 'fixture');
    scope.fixture.file('docker-root', scope.fixture.root + '/alternate-docker');
    expect(scope.run().status).toBe(0);
    scope.layout([1, 2, 3, 4], [999999, 999999, 999999, 3 * scope.b + scope.reserve - 1]);
    expect(scope.run().stderr).toContain(scope.fixture.root + '/alternate-docker requires');
  });
}

export function registerUsesValidatedNativeDeviceInodePairsWhenAvailable(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it.each([scope.run, scope.runStaging])('uses validated native device/inode pairs when available', (check) => {
    scope.fixture.file(
      'bin/stat',
      '#!/bin/sh\nif test "$1" = -c && test "$2" = "%u:%g:%a" && test "$3" = /; then printf "0:0:700\\n"; exit 0; fi\ntest "$1" = -Lc && test "$2" = "%d:%i" || exit 99\nprintf "1:123\\n"\n',
      0o700,
    );
    scope.layout([1, 1, 1, 1], Array(4).fill(5 * scope.b + scope.reserve));
    expect(check().status).toBe(0);
  });
}
