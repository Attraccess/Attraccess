import { existsSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import {
  WAGO_DOUT,
  WAGO_RUN_LEDS,
  wagoCommissioningPreparationScript,
  wagoDockerProvisionRecoveryScript,
  wagoDockerProvisionFinishScript,
  wagoHardwareDeploymentReportScript,
  wagoRuntimeBootScript,
} from './wago-hardware-deployment';
import { registerReportsSoftwareSupportReadOnlyAndStrictlyParsesTheEnumOnlyContract } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerWaitsForAnActiveSupervisorGateBeforeStartingTheOwnedPreparationJournal } from './wago-hardware-deployment.retries-a-transient-gate-failure-without-losing-enablement-and-retains-its-diagnostic.test-cases';
import { registerFallsBackFromBusyBoxSetprivToCapshForReportAndPreparation } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerRejectsUnverifiedPrivilegesBeforePreparationMutations } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerRejectsInvalidIdentityBeforeChangingTheControllerS } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerAlwaysStopsAndPermanentlyDisablesActiveCodesysBeforeGrantingExactUidPermissions } from './wago-hardware-deployment.activates-installed-stopped-docker-despite-existing-storage-and-prior-workload-metadata.test-cases';
import { registerRejectsVendorSuccessWithNonzeroSelectionAndAnSEnabledLink } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerFailsClosedWithoutIoOwnershipOrRuntimeStartWhenS } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerRejectsASOutputRegister } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerUsesFirmwareInstallActivateAndEnablesTheVendorBootHookWithoutDownloadingBinaries } from './wago-hardware-deployment.retries-a-transient-gate-failure-without-losing-enablement-and-retains-its-diagnostic.test-cases';
import { registerActivatesInstalledStoppedDockerDespiteExistingStorageAndPriorWorkloadMetadata } from './wago-hardware-deployment.activates-installed-stopped-docker-despite-existing-storage-and-prior-workload-metadata.test-cases';
import { registerRetainsARetryableOwnedJournalUntilDockerPermitsVerifiedContainment } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerStopsTheExactOwnedPredecessorAndDisablesItsUnsafeRestartBeforeTakeover } from './wago-hardware-deployment.retries-a-transient-gate-failure-without-losing-enablement-and-retains-its-diagnostic.test-cases';
import { registerRejectsAnUnrelatedJournalTokenAndExposesExplicitActionValidation } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerContainsLegacyActivationEffectsWithoutRestoringCodesysOrVendorNetworking } from './wago-hardware-deployment.activates-installed-stopped-docker-despite-existing-storage-and-prior-workload-metadata.test-cases';
import { registerRetainsRecoveryOwnershipWhenDockerdIsAbsentButAnOwnedWriterMaySurvive } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerDoesNotFollowAPlantedFixedBootStagingSymlink } from './wago-hardware-deployment.activates-installed-stopped-docker-despite-existing-storage-and-prior-workload-metadata.test-cases';
import { registerRejectsANonRootOwnedRetainedPreparationJournalS } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerContainsABootStartWhenItsSupervisorCannotAcknowledgeStartup } from './wago-hardware-deployment.activates-installed-stopped-docker-despite-existing-storage-and-prior-workload-metadata.test-cases';
import { registerWaitsForSupervisorReadinessOutsideTheInitialHardwareGateDeadline } from './wago-hardware-deployment.retries-a-transient-gate-failure-without-losing-enablement-and-retains-its-diagnostic.test-cases';
import { registerRetriesATransientGateFailureWithoutLosingEnablementAndRetainsItsDiagnostic } from './wago-hardware-deployment.retries-a-transient-gate-failure-without-losing-enablement-and-retains-its-diagnostic.test-cases';
import { registerContainsASupervisorFailureToExecuteItsGate } from './wago-hardware-deployment.activates-installed-stopped-docker-despite-existing-storage-and-prior-workload-metadata.test-cases';
import { registerRunsExactlyThePreGrantAndPreStartIoScansInACompleteSupervisorCycle } from './wago-hardware-deployment.retries-a-transient-gate-failure-without-losing-enablement-and-retains-its-diagnostic.test-cases';
import { registerContainsAnOverallSObservationTimeoutWithoutAcknowledgingReadiness } from './wago-hardware-deployment.activates-installed-stopped-docker-despite-existing-storage-and-prior-workload-metadata.test-cases';
import { registerContainsAnAlreadyRunningRuntimeWhenBootObservationFailsS } from './wago-hardware-deployment.activates-installed-stopped-docker-despite-existing-storage-and-prior-workload-metadata.test-cases';
import { registerContainsThePredecessorBeforeAFailedCodesysStopCanInterruptPreparation } from './wago-hardware-deployment.activates-installed-stopped-docker-despite-existing-storage-and-prior-workload-metadata.test-cases';
import { registerBlocksAnUnownedOpenWritableDoutDescriptorBeforeChangingIoPermissions } from './wago-hardware-deployment.activates-installed-stopped-docker-despite-existing-storage-and-prior-workload-metadata.test-cases';
import { registerRechecksActiveCodesysBeforeASupervisedCrashRetry } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerCoolsDownAfterFiveConsecutiveCrashStartsWithoutDelegatingARetryToDocker } from './wago-hardware-deployment.activates-installed-stopped-docker-despite-existing-storage-and-prior-workload-metadata.test-cases';
import { registerRefusesACrashRestartThroughTheRealWatchGateAndContainsTheRuntime } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerReappliesNarrowPermissionsOnRebootAndStartsOnlyAfterTheGateSucceeds } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerPreservesACompetingTransactionDuringTheSLockHandoff } from './wago-hardware-deployment.fails-closed-without-io-ownership-or-runtime-start-when-s.test-cases';
import { registerBlocksRuntimeBootForSEvenIfRunPartsProceeds } from './wago-hardware-deployment.activates-installed-stopped-docker-despite-existing-storage-and-prior-workload-metadata.test-cases';
import { registerEmitsUidCapabilitiesHostNetworkingAndOnlyTwoContractedRegisterMounts } from './wago-hardware-deployment.activates-installed-stopped-docker-despite-existing-storage-and-prior-workload-metadata.test-cases';

describe('FW31 destructive commissioning shell (isolated vendor command fixtures)', () => {
  defineFw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTests();
});

export function defineFw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTests() {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  const token = 'a'.repeat(32);
  const journal = 'etc/attraccess-wago/docker-provision';
  const prepare = (fault = '') => fixture.run(wagoCommissioningPreparationScript(token, fixture.root), fault);
  const report = () => fixture.run(wagoHardwareDeploymentReportScript(fixture.root));
  const recover = (fault = '') => fixture.run(wagoDockerProvisionRecoveryScript(token, fixture.root), fault);
  const finish = () => fixture.run(wagoDockerProvisionFinishScript(token, 'restored', fixture.root));
  const stopAfterRetry = () =>
    fixture.file(
      'bin/sleep',
      `#!/bin/sh
if test "$1" = 30; then
  test -f "$FIXTURE_ROOT/etc/attraccess-wago/runtime-enabled" || exit 99
  touch "$FIXTURE_ROOT/retry-enabled"
  rm "$FIXTURE_ROOT/etc/attraccess-wago/runtime-enabled"
fi
`,
      0o700,
    );
  const activePlc = () => {
    fixture.file('plc', 'running');
    fixture.file('etc/specific/rtsversion', '1');
    symlinkSync(join(fixture.root, 'etc/init.d/runtime'), join(fixture.root, 'etc/rc.d/S98_runtime'));
  };
  beforeEach(() => {
    fixture = fw31ShellFixture();
  });
  afterEach(() => fixture.dispose());
  const scope = {
    get report() {
      return report;
    },
    get fixture() {
      return fixture;
    },
    set fixture(value: typeof fixture) {
      fixture = value;
    },
    get prepare() {
      return prepare;
    },
    get journal() {
      return journal;
    },
    get activePlc() {
      return activePlc;
    },
    get recover() {
      return recover;
    },
    get finish() {
      return finish;
    },
    get token() {
      return token;
    },
    get stopAfterRetry() {
      return stopAfterRetry;
    },
  };

  registerReportsSoftwareSupportReadOnlyAndStrictlyParsesTheEnumOnlyContract(scope);

  registerWaitsForAnActiveSupervisorGateBeforeStartingTheOwnedPreparationJournal(scope);

  it('pins vendor subprocess Docker commands to the local socket despite an inherited remote context', () => {
    const script =
      'export DOCKER_CONTEXT=untrusted DOCKER_HOST=tcp://untrusted:2375\n' +
      wagoCommissioningPreparationScript(token, fixture.root);
    expect(fixture.run(script).status).toBe(0);
  });

  registerFallsBackFromBusyBoxSetprivToCapshForReportAndPreparation(scope);

  it('prepares with capsh even when setpriv is absent', () => {
    rmSync(join(fixture.root, 'bin/setpriv'));
    expect(prepare().status).toBe(0);
  });

  registerRejectsUnverifiedPrivilegesBeforePreparationMutations(scope);

  registerRejectsInvalidIdentityBeforeChangingTheControllerS(scope);

  registerAlwaysStopsAndPermanentlyDisablesActiveCodesysBeforeGrantingExactUidPermissions(scope);

  it('stops a stale active PLC when the selected runtime is already zero', () => {
    fixture.file('plc', 'running');
    expect(prepare('codesys2').status).toBe(0);
    expect(fixture.read('plc')).toBe('stopped');
  });

  registerRejectsVendorSuccessWithNonzeroSelectionAndAnSEnabledLink(scope);

  registerFailsClosedWithoutIoOwnershipOrRuntimeStartWhenS(scope);

  registerRejectsASOutputRegister(scope);

  it.each(['chown-failed', 'privilege-tools-unavailable', 'io-permissions'])('fails closed for %s', (fault) => {
    expect(prepare(fault).status).not.toBe(0);
    expect(existsSync(join(fixture.root, journal, 'started'))).toBe(false);
  });

  registerUsesFirmwareInstallActivateAndEnablesTheVendorBootHookWithoutDownloadingBinaries(scope);

  registerActivatesInstalledStoppedDockerDespiteExistingStorageAndPriorWorkloadMetadata(scope);

  registerRetainsARetryableOwnedJournalUntilDockerPermitsVerifiedContainment(scope);

  it('does not fabricate install support when a firmware binary is missing', () => {
    rmSync(join(fixture.root, 'bin/dockerd'));
    expect(prepare().status).not.toBe(0);
    expect(existsSync(join(fixture.root, 'vendor.log'))).toBe(false);
  });

  it.each([WAGO_DOUT, '/sys', '/'])('rejects other output writers with bind %s', (source) => {
    fixture.setContainers([
      { id: 'other', name: 'other', running: false, mounts: [source === '/' ? '/' : join(fixture.root, source)] },
    ]);
    expect(prepare().stderr).toContain('output-container-conflict');
  });

  it('rejects privileged competitors even when Docker lists no explicit output bind', () => {
    fixture.setContainers([{ id: 'other', name: 'other', running: false, privileged: true }]);
    expect(prepare().stderr).toContain('output-container-conflict');
  });

  registerStopsTheExactOwnedPredecessorAndDisablesItsUnsafeRestartBeforeTakeover(scope);

  it.each(['ps-failed', 'docker-info-failed', 'docker-list-failed', 'locked'])(
    'refuses uncertain state: %s',
    (fault) => {
      expect(prepare(fault).status).not.toBe(0);
    },
  );

  registerRejectsAnUnrelatedJournalTokenAndExposesExplicitActionValidation(scope);

  it('recovers a preflight-only failure without requiring an old workload snapshot', () => {
    expect(recover().status).toBe(0);
    expect(finish().status).toBe(0);
    expect(recover().status).toBe(0);
    expect(fixture.containers()).toEqual([]);
  });

  registerContainsLegacyActivationEffectsWithoutRestoringCodesysOrVendorNetworking(scope);

  it('retains incomplete legacy integrity metadata rather than deleting it', () => {
    fixture.file(journal + '/token', token);
    fixture.file(journal + '/prior', 'stopped');
    fixture.file(journal + '/os-release', fixture.read('etc/os-release'));
    expect(recover().stderr).toContain('Incomplete firmware/service context');
  });

  registerRetainsRecoveryOwnershipWhenDockerdIsAbsentButAnOwnedWriterMaySurvive(scope);

  registerDoesNotFollowAPlantedFixedBootStagingSymlink(scope);

  registerRejectsANonRootOwnedRetainedPreparationJournalS(scope);

  registerContainsABootStartWhenItsSupervisorCannotAcknowledgeStartup(scope);

  registerWaitsForSupervisorReadinessOutsideTheInitialHardwareGateDeadline(scope);

  registerRetriesATransientGateFailureWithoutLosingEnablementAndRetainsItsDiagnostic(scope);

  registerContainsASupervisorFailureToExecuteItsGate(scope);

  it('bounds both complete gate entry points to 300 seconds with a five-second kill grace', () => {
    const script = wagoRuntimeBootScript();
    expect(script).toContain('observation=$(timeout -k 5 300 "$hook" "$cycle" 8>&- 2>"$gate_error")');
    expect(script).toContain('if timeout -k 5 300 "$hook" "$action-checked"; then');
    expect(script.match(/timeout -k 5 300 "\$hook"/g)).toHaveLength(2);
  });

  registerRunsExactlyThePreGrantAndPreStartIoScansInACompleteSupervisorCycle(scope);

  registerContainsAnOverallSObservationTimeoutWithoutAcknowledgingReadiness(scope);

  registerContainsAnAlreadyRunningRuntimeWhenBootObservationFailsS(scope);

  it('reports boot stop failure without declaring a surviving runtime stopped', () => {
    fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
    expect(fixture.run('set -- stop\n' + wagoRuntimeBootScript(fixture.root), 'stop-failed').status).not.toBe(0);
    expect(fixture.containers()[0].running).toBe(true);
  });

  it('refuses a successful stop command whose postcondition still reports a running predecessor', () => {
    fixture.setContainers([{ id: 'old', name: 'attraccess-wago', running: true, restart: 'unless-stopped' }]);
    expect(prepare('stop-stuck').stderr).toContain('Cannot verify previous runtime containment');
    expect(existsSync(join(fixture.root, journal, 'started'))).toBe(false);
  });

  registerContainsThePredecessorBeforeAFailedCodesysStopCanInterruptPreparation(scope);

  registerBlocksAnUnownedOpenWritableDoutDescriptorBeforeChangingIoPermissions(scope);

  it('rejects an alternate runtime boot link after the canonical entry is disabled', () => {
    symlinkSync(join(fixture.root, 'etc/init.d/runtime'), join(fixture.root, 'etc/rc.d/S97_plc'));
    expect(prepare().stderr).toContain('codesys-boot-enabled');
  });

  it('rejects a Docker boot entry pointing to an unrelated executable', () => {
    rmSync(join(fixture.root, 'etc/rc.d/S99_docker'));
    symlinkSync(join(fixture.root, 'etc/init.d/runtime'), join(fixture.root, 'etc/rc.d/S99_docker'));
    expect(prepare().status).not.toBe(0);
  });

  it('rejects vendor activation from SD boot before calling the mutation', () => {
    fixture.file('daemon', 'stopped');
    expect(prepare('sd-card').stderr).toContain('Unsupported Docker boot medium');
    expect(fixture.read('vendor.log')).not.toContain('config_docker');
  });

  registerRechecksActiveCodesysBeforeASupervisedCrashRetry(scope);

  registerCoolsDownAfterFiveConsecutiveCrashStartsWithoutDelegatingARetryToDocker(scope);

  registerRefusesACrashRestartThroughTheRealWatchGateAndContainsTheRuntime(scope);

  registerReappliesNarrowPermissionsOnRebootAndStartsOnlyAfterTheGateSucceeds(scope);

  it('does not stop another active transaction when the boot hook cannot obtain its lock', () => {
    fixture.file('etc/attraccess-wago/runtime-enabled', '');
    fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
    expect(fixture.run('set -- start\n' + wagoRuntimeBootScript(fixture.root), 'locked').status).not.toBe(0);
    expect(fixture.containers()[0].running).toBe(true);
  });

  registerPreservesACompetingTransactionDuringTheSLockHandoff(scope);

  registerBlocksRuntimeBootForSEvenIfRunPartsProceeds(scope);

  registerEmitsUidCapabilitiesHostNetworkingAndOnlyTwoContractedRegisterMounts(scope);

  it('grants present RUN LED files best-effort and tolerates their absence', () => {
    fixture.file(WAGO_RUN_LEDS.green.slice(1), '0', 0o644);
    expect(prepare().status).toBe(0);
    expect(statSync(join(fixture.root, WAGO_RUN_LEDS.green)).mode & 0o777).toBe(0o600);
    expect(existsSync(join(fixture.root, WAGO_RUN_LEDS.red))).toBe(false);
  });

  return scope;
}

export type Fw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTestScope = ReturnType<
  typeof defineFw31DestructiveCommissioningShellIsolatedVendorCommandFixturesTests
>;
