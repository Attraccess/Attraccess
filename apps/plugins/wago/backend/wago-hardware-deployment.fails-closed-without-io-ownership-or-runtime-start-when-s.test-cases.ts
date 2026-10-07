import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope } from './wago-hardware-deployment.spec';
import { wagoHardwareDeploymentReportScript } from './wago-hardware-deployment';
import { wagoRuntimeBootScript } from './wago-hardware-deployment';
import { mkdirSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { symlinkSync } from 'node:fs';
import { WAGO_DIN } from './wago-hardware-deployment';
import { WAGO_DOUT } from './wago-hardware-deployment';
import { wagoCommissioningPreparationScript } from './wago-hardware-deployment';
import { wagoDockerProvisionScript } from './wago-hardware-deployment';
import { fw31Model } from './fixtures/fw31-identity';
import { fw31Revisions } from './fixtures/fw31-identity';
import { parseWagoHardwareDeploymentReport } from './wago-hardware-deployment';

export function registerFailsClosedWithoutIoOwnershipOrRuntimeStartWhenS(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it.each(['codesys-stop-failed', 'codesys-stop-stuck', 'codesys-disable-failed', 'codesys-boot-stuck'])(
    'fails closed without IO ownership or runtime start when %s',
    (fault) => {
      scope.activePlc();
      scope.fixture.file('owners.json', '{}');
      expect(scope.prepare(fault).status).not.toBe(0);
      expect(scope.fixture.read('owners.json')).toBe('{}');
      expect(existsSync(join(scope.fixture.root, scope.journal, 'started'))).toBe(false);
      expect(scope.fixture.containers()).toEqual([]);
    },
  );
}

export function registerFallsBackFromBusyBoxSetprivToCapshForReportAndPreparation(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('falls back from BusyBox setpriv to capsh for report and preparation', () => {
    expect(
      scope.fixture.run(wagoHardwareDeploymentReportScript(scope.fixture.root), 'busybox-setpriv').stdout,
    ).toContain('hardware=accessible');
    expect(scope.prepare('busybox-setpriv').status).toBe(0);
    expect(scope.fixture.read('privilege.log')).toContain('capsh');
  });
}

export function registerPreservesACompetingTransactionDuringTheSLockHandoff(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it.each(['start', 'stop'])('preserves a competing transaction during the %s lock handoff', (action) => {
    scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
    scope.fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
    const result = scope.fixture.run(`set -- ${action}\n` + wagoRuntimeBootScript(scope.fixture.root), 'lock-handoff');
    expect(result.status).toBe(75);
    expect(scope.fixture.containers()[0].running).toBe(true);
    expect(existsSync(join(scope.fixture.root, 'etc/attraccess-wago/runtime-enabled'))).toBe(true);
  });
}

export function registerReappliesNarrowPermissionsOnRebootAndStartsOnlyAfterTheGateSucceeds(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('reapplies narrow permissions on reboot and starts only after the gate succeeds', () => {
    expect(scope.prepare().status).toBe(0);
    scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
    scope.fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: false, restart: 'no' }]);
    scope.fixture.file('owners.json', '{}');
    const r = scope.fixture.run(wagoRuntimeBootScript(scope.fixture.root) + '\n', '');
    // Invoke it as init would: the action must be start.
    expect(r.status).not.toBe(0);
    const boot = scope.fixture.run('set -- start\n' + wagoRuntimeBootScript(scope.fixture.root));
    expect(boot.status).toBe(0);
    expect(scope.fixture.containers()[0].running).toBe(true);
  });
}

export function registerRechecksActiveCodesysBeforeASupervisedCrashRetry(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('rechecks active CODESYS before a supervised crash retry', () => {
    scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
    scope.fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
    scope.fixture.file(
      'bin/sleep',
      `#!${process.execPath}
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT;
if(process.argv[2]==='30'){fs.rmSync(root+'/etc/attraccess-wago/runtime-enabled');process.exit(0);}
const state=JSON.parse(fs.readFileSync(root+'/containers.json','utf8'));
state[0].running=false;fs.writeFileSync(root+'/containers.json',JSON.stringify(state));
fs.rmSync(root+'/proc/42',{recursive:true,force:true});fs.writeFileSync(root+'/plc','running');
fs.mkdirSync(root+'/proc/77',{recursive:true});fs.writeFileSync(root+'/proc/77/comm','codesys3\\n');
fs.writeFileSync(root+'/proc/77/stat','77 (codesys3) S '+'0 '.repeat(18)+'77'+' 0'.repeat(30)+'\\n');
fs.writeFileSync(root+'/proc/77/exe','synthetic runtime executable');
`,
      0o700,
    );
    const result = scope.fixture.run('set -- supervise\n' + wagoRuntimeBootScript(scope.fixture.root));
    expect(result.status).toBe(0);
    expect(scope.fixture.read('etc/attraccess-wago/supervisor.last-error')).toContain('codesys-active');
    expect(scope.fixture.read('docker.log')).not.toContain('start attraccess-wago');
    expect(scope.fixture.containers()[0].running).toBe(false);
  });
}

export function registerRefusesACrashRestartThroughTheRealWatchGateAndContainsTheRuntime(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('refuses a crash restart through the real watch gate and contains the runtime', () => {
    scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
    scope.fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: false, restart: 'no' }]);
    const result = scope.fixture.run('set -- watch\n' + wagoRuntimeBootScript(scope.fixture.root));
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Runtime crash retry limit reached');
    expect(scope.fixture.read('docker.log')).not.toContain('start attraccess-wago');
    expect(scope.fixture.containers()[0]).toMatchObject({ running: false, restart: 'no' });
    expect(existsSync(join(scope.fixture.root, 'etc/attraccess-wago/runtime-enabled'))).toBe(true);
  });
}

export function registerRejectsANonRootOwnedRetainedPreparationJournalS(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it.each([scope.journal, `etc/attraccess-wago/docker-provision.completed-${scope.token}`])(
    'rejects a non-root-owned retained preparation journal: %s',
    (path) => {
      scope.fixture.file(path + '/token', scope.token);
      scope.fixture.file(path + '/mode', 'destructive');
      scope.fixture.file('owners.json', JSON.stringify({ ['/' + path]: '20000:20000' }));
      expect(scope.prepare().stderr).toContain('Unsafe preparation journal ownership');
      expect(scope.recover().stderr).toContain('Unsafe preparation journal ownership');
      expect(existsSync(join(scope.fixture.root, path, 'started'))).toBe(false);
    },
  );
}

export function registerRejectsASOutputRegister(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it.each(['missing', 'directory', 'symlink'])('rejects a %s output register', (kind) => {
    rmSync(join(scope.fixture.root, WAGO_DOUT));
    if (kind === 'directory') mkdirSync(join(scope.fixture.root, WAGO_DOUT));
    if (kind === 'symlink') symlinkSync(join(scope.fixture.root, WAGO_DIN), join(scope.fixture.root, WAGO_DOUT));
    expect(scope.prepare().status).not.toBe(0);
    expect(existsSync(join(scope.fixture.root, scope.journal, 'started'))).toBe(false);
  });
}

export function registerRejectsAnUnrelatedJournalTokenAndExposesExplicitActionValidation(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('rejects an unrelated journal token and exposes explicit action validation', () => {
    expect(() =>
      wagoDockerProvisionScript({
        token: scope.token,
        action: 'start-installed-runtime',
        reviewedDockerActivation: false,
      }),
    ).toThrow();
    expect(() => wagoCommissioningPreparationScript('invalid')).toThrow();
    scope.fixture.file(scope.journal + '/token', 'b'.repeat(32));
    scope.fixture.file(scope.journal + '/mode', 'destructive');
    expect(scope.prepare().stderr).toContain('token mismatch');
    expect(scope.recover().stderr).toContain('token mismatch');
  });
}

export function registerRejectsInvalidIdentityBeforeChangingTheControllerS(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it.each([
    ['missing REVISIONS', 'etc/REVISIONS', null],
    ['wrong REVISIONS', 'etc/REVISIONS', fw31Revisions.replace('(31)', '(32)')],
    ['duplicate REVISIONS firmware', 'etc/REVISIONS', fw31Revisions.repeat(2)],
    ['model mismatch', 'sys/firmware/devicetree/base/model', fw31Model.replace('751-9301', '751-9302')],
  ] as const)('rejects invalid identity before changing the controller: %s', (_scenario, path, content) => {
    if (content === null) rmSync(join(scope.fixture.root, path));
    else scope.fixture.file(path, content);
    expect(scope.report().stdout).toContain('platform=unsupported-firmware');
    const result = scope.prepare();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unsupported-firmware');
    expect(existsSync(join(scope.fixture.root, scope.journal))).toBe(false);
    expect(existsSync(join(scope.fixture.root, 'vendor.log'))).toBe(false);
  });
}

export function registerRejectsUnverifiedPrivilegesBeforePreparationMutations(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('rejects unverified privileges before preparation mutations', () => {
    scope.fixture.file(
      'privilege-status',
      scope.fixture.read('privilege-status').replace('CapBnd: 0000000000000000', 'CapBnd: 0000000000000001'),
    );
    expect(scope.prepare().stderr).toContain('permission-tool-unavailable');
    expect(existsSync(join(scope.fixture.root, scope.journal))).toBe(false);
    expect(existsSync(join(scope.fixture.root, 'vendor.log'))).toBe(false);
    expect(existsSync(join(scope.fixture.root, 'permission-tests.log'))).toBe(false);
  });
}

export function registerRejectsVendorSuccessWithNonzeroSelectionAndAnSEnabledLink(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it.each(['absent', 'broken'])('rejects vendor success with nonzero selection and an %s enabled link', (kind) => {
    scope.fixture.file('etc/specific/rtsversion', '1');
    if (kind === 'broken')
      symlinkSync(join(scope.fixture.root, 'missing-runtime'), join(scope.fixture.root, 'etc/rc.d/S98_runtime'));
    const owners = scope.fixture.read('owners.json');
    expect(scope.prepare().stderr).toContain('codesys-boot-enabled');
    expect(scope.fixture.read('etc/specific/rtsversion')).toBe('1');
    expect(scope.fixture.read('owners.json')).toBe(owners);
    expect(existsSync(join(scope.fixture.root, scope.journal, 'started'))).toBe(false);
  });
}

export function registerReportsSoftwareSupportReadOnlyAndStrictlyParsesTheEnumOnlyContract(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('reports software support read-only and strictly parses the enum-only contract', () => {
    const r = scope.report();
    expect(r.status).toBe(0);
    expect(parseWagoHardwareDeploymentReport(r.stdout)).toMatchObject({
      platform: 'supported',
      hardware: 'accessible',
      docker: 'running',
      exclusivity: 'clear',
      provision: 'prepare-controller',
      qualification: 'software-supported',
    });
    expect(() => parseWagoHardwareDeploymentReport(r.stdout.trimEnd())).toThrow();
    expect(() => parseWagoHardwareDeploymentReport(r.stdout.replace('hardware=accessible', 'version=1'))).toThrow();
    expect(existsSync(join(scope.fixture.root, 'vendor.log'))).toBe(false);
    expect(scope.fixture.read(WAGO_DIN)).toBe('5');
    expect(scope.fixture.read(WAGO_DOUT)).toBe('2');
  });
}

export function registerRetainsARetryableOwnedJournalUntilDockerPermitsVerifiedContainment(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('retains a retryable owned journal until Docker permits verified containment', () => {
    scope.fixture.file('daemon', 'stopped');
    expect(scope.prepare('docker-activate-failed').stderr).toContain('docker-activation-failed');
    expect(scope.recover().status).not.toBe(0);
    expect(existsSync(join(scope.fixture.root, scope.journal, 'restored'))).toBe(false);
    scope.fixture.file('daemon', 'running');
    expect(scope.recover().status).toBe(0);
    expect(scope.finish().status).toBe(0);
    expect(scope.recover().status).toBe(0);
    expect(scope.finish().status).toBe(0);
    expect(scope.fixture.read('daemon')).toBe('running');
  });
}

export function registerRetainsRecoveryOwnershipWhenDockerdIsAbsentButAnOwnedWriterMaySurvive(
  scope: Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope,
): void {
  it('retains recovery ownership when dockerd is absent but an owned writer may survive', () => {
    scope.fixture.file(scope.journal + '/token', scope.token);
    scope.fixture.file(scope.journal + '/mode', 'destructive');
    scope.fixture.file('daemon', 'stopped');
    scope.fixture.setContainers([{ id: 'survivor', name: 'attraccess-wago', running: true }]);
    expect(scope.recover().status).not.toBe(0);
    expect(existsSync(join(scope.fixture.root, scope.journal, 'restored'))).toBe(false);
    expect(scope.fixture.containers()[0].running).toBe(true);
  });
}
