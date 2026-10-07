import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import {
  runtimeBundleAcceptScript,
  runtimeBundleDeliveryScript,
  runtimeBundleInstallScript,
  runtimeBundleRecoveryScript,
  runtimeBundleStreamReceiver,
} from './wago-runtime-install';
import { registerInstallsAFreshRuntimeWithAutomaticDockerRestartsDisabledAndGatedBootRetainingRecoveryO } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerDiscardsTheOldOwnedContainerAndCredentialsRatherThanBackingUpOrRestartingThem } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerAllowsASlowFirmwareImageImportToCompleteBeforeStartingTheRuntime } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerInstallsTheRtuReleaseWithOnlyTheCc100SerialDeviceAndItsExistingGroup } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerRejectsAnRtuReleaseBeforeReplacingTheCurrentRuntimeWhenItsSerialDeviceIsMissing } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerStillBoundsAStalledImageImportAndContainsTheFailedInstallation } from './wago-runtime-install.retains-a-destructive-transaction-if-its-predecessor-cannot-be-contained.test-cases';
import { registerContainsSFailuresWithoutRestoringOldWorkloads } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerRetainsInterruptedExecutionUntilExplicitCleanupAndNeverRestartsThePredecessor } from './wago-runtime-install.retains-a-destructive-transaction-if-its-predecessor-cannot-be-contained.test-cases';
import { registerRetainsTheRecoveryJournalIfDockerRemovalFailsThenResumesCleanupSafely } from './wago-runtime-install.retains-a-destructive-transaction-if-its-predecessor-cannot-be-contained.test-cases';
import { registerRetainsRecoveryOwnershipWhenTheDaemonIsUnavailableWhileItsContainerSurvives } from './wago-runtime-install.retains-a-destructive-transaction-if-its-predecessor-cannot-be-contained.test-cases';
import { registerRetainsRecoveryOwnershipOnSInsteadOfClaimingContainment } from './wago-runtime-install.retains-a-destructive-transaction-if-its-predecessor-cannot-be-contained.test-cases';
import { registerRetainsADestructiveTransactionIfItsPredecessorCannotBeContained } from './wago-runtime-install.retains-a-destructive-transaction-if-its-predecessor-cannot-be-contained.test-cases';
import { registerFailsBeforeDiscardingAPredecessorIfFirmwareHardwareOrTheBootGateIsUnavailable } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerRequiresControllerPreparationAndRejectsANewlyActivePlc } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerProtectsTheFixedCaOutsideWritableStateAndDiscardsItOnFailedEnrollment } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerRetainsAnUnfinishedTransactionWhenItsRuntimeIsStopped } from './wago-runtime-install.retains-a-destructive-transaction-if-its-predecessor-cannot-be-contained.test-cases';
import { registerAcceptsExplicitlyPreservesActiveTrustAndSupportsANewDestructiveEnrollment } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerStreamsTheExactAuthenticatedBundleWithTokenOwnershipAndPrivateStagedCredentials } from './wago-runtime-install.retains-a-destructive-transaction-if-its-predecessor-cannot-be-contained.test-cases';
import { registerDoesNotInstallASOfflineBundle } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerRejectsAWrongEmbeddedImageReferenceBeforeDiscardingExistingState } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerRecoversInterruptionBeforeTheUploadJournalExistsUsingExactPreparationOwnership } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerRejectsAnUntrustedPreparationJournalBeforeUsingItsRecoveryOwnership } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerPublishesRecoveryOwnershipAtomicallyWhenInterruptedBeforeTheReceiptRename } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerContainsValidLegacyTransactionsWithoutRestoringTheirPriorContainerOrData } from './wago-runtime-install.accepts-explicitly-preserves-active-trust-and-supports-a-new-destructive-enrollment.test-cases';
import { registerSerializesDeliveryWhileAStreamIsStillReceivingBytesUsingRealFlock } from './wago-runtime-install.retains-a-destructive-transaction-if-its-predecessor-cannot-be-contained.test-cases';
import { registerWaitsForAnActiveRuntimeMonitorBeforeCleaningUpItsRetainedInstallation } from './wago-runtime-install.retains-a-destructive-transaction-if-its-predecessor-cannot-be-contained.test-cases';

const image = 'example.invalid/runtime@sha256:' + 'a'.repeat(64);
const token = 'a'.repeat(32);

describe('destructive runtime shell transaction and offline stream fixtures', () => {
  defineDestructiveRuntimeShellTransactionAndOfflineStreamFixturesTests();
});

export function defineDestructiveRuntimeShellTransactionAndOfflineStreamFixturesTests() {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  const config = 'etc/attraccess-wago';
  const data = 'var/lib/attraccess-wago';
  const tx = 'var/lib/attraccess-wago-install-transaction';
  const install = (fault = '') => fixture.run(runtimeBundleInstallScript(image, fixture.root), fault);
  const recover = (fault = '') => fixture.run(runtimeBundleRecoveryScript(fixture.root), fault);
  const prior = () => {
    fixture.setContainers([{ id: 'old-id', name: 'attraccess-wago', running: true, restart: 'unless-stopped' }]);
    fixture.file(data + '/credentials.json', 'revoked-old-fixture-credentials');
    fixture.file(config + '/runtime.env', 'OLD=fixture');
    fixture.file(config + '/runtime-ca.pem', 'old public CA');
  };
  const delivery = () => {
    const bundle = readFileSync(join(fixture.root, 'tmp/attraccess-wago-runtime.tar'));
    return {
      bundle,
      script: runtimeBundleDeliveryScript(
        image,
        'NEW=enrollment',
        'public CA',
        bundle.length,
        createHash('sha256').update(bundle).digest('hex'),
        token,
        fixture.root,
      ),
    };
  };
  beforeEach(() => {
    fixture = fw31ShellFixture();
    fixture.file(config + '/runtime.env.next', 'NEW=enrollment');
    fixture.file('bundle/image-reference', image + '\n');
    fixture.file('bundle/image.tar', 'fixture image bytes');
    const archive = spawnSync('/usr/bin/tar', [
      '-cf',
      join(fixture.root, 'tmp/attraccess-wago-runtime.tar'),
      '-C',
      join(fixture.root, 'bundle'),
      'image-reference',
      'image.tar',
    ]);
    expect(archive.status).toBe(0);
  });
  afterEach(() => fixture.dispose());
  const scope = {
    get install() {
      return install;
    },
    get fixture() {
      return fixture;
    },
    set fixture(value: typeof fixture) {
      fixture = value;
    },
    get config() {
      return config;
    },
    get tx() {
      return tx;
    },
    get prior() {
      return prior;
    },
    get data() {
      return data;
    },
    get recover() {
      return recover;
    },
    get image() {
      return image;
    },
    get token() {
      return token;
    },
    get delivery() {
      return delivery;
    },
  };

  registerInstallsAFreshRuntimeWithAutomaticDockerRestartsDisabledAndGatedBootRetainingRecoveryO(scope);

  registerDiscardsTheOldOwnedContainerAndCredentialsRatherThanBackingUpOrRestartingThem(scope);

  registerAllowsASlowFirmwareImageImportToCompleteBeforeStartingTheRuntime(scope);

  registerInstallsTheRtuReleaseWithOnlyTheCc100SerialDeviceAndItsExistingGroup(scope);

  registerRejectsAnRtuReleaseBeforeReplacingTheCurrentRuntimeWhenItsSerialDeviceIsMissing(scope);

  registerStillBoundsAStalledImageImportAndContainsTheFailedInstallation(scope);

  registerContainsSFailuresWithoutRestoringOldWorkloads(scope);

  registerRetainsInterruptedExecutionUntilExplicitCleanupAndNeverRestartsThePredecessor(scope);

  registerRetainsTheRecoveryJournalIfDockerRemovalFailsThenResumesCleanupSafely(scope);

  registerRetainsRecoveryOwnershipWhenTheDaemonIsUnavailableWhileItsContainerSurvives(scope);

  registerRetainsRecoveryOwnershipOnSInsteadOfClaimingContainment(scope);

  registerRetainsADestructiveTransactionIfItsPredecessorCannotBeContained(scope);

  registerFailsBeforeDiscardingAPredecessorIfFirmwareHardwareOrTheBootGateIsUnavailable(scope);

  registerRequiresControllerPreparationAndRejectsANewlyActivePlc(scope);

  it('refuses other output containers and query failures, never inferring absence', () => {
    fixture.setContainers([{ id: 'other', name: 'other', running: false, mounts: [join(fixture.root, 'sys')] }]);
    expect(install().stderr).toContain('output-container-conflict');
    expect(install('docker-list-failed').status).not.toBe(0);
    expect(install('docker-info-failed').status).not.toBe(0);
  });

  registerProtectsTheFixedCaOutsideWritableStateAndDiscardsItOnFailedEnrollment(scope);

  registerRetainsAnUnfinishedTransactionWhenItsRuntimeIsStopped(scope);

  it('waits for the active supervisor gate before accepting a healthy installation', () => {
    expect(install().status).toBe(0);
    const result = fixture.run(runtimeBundleAcceptScript(fixture.root), 'supervisor-lock-held');
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(existsSync(join(fixture.root, tx))).toBe(false);
  });

  registerAcceptsExplicitlyPreservesActiveTrustAndSupportsANewDestructiveEnrollment(scope);

  registerStreamsTheExactAuthenticatedBundleWithTokenOwnershipAndPrivateStagedCredentials(scope);

  registerDoesNotInstallASOfflineBundle(scope);

  registerRejectsAWrongEmbeddedImageReferenceBeforeDiscardingExistingState(scope);

  registerRecoversInterruptionBeforeTheUploadJournalExistsUsingExactPreparationOwnership(scope);

  it('does not clear unowned staged configuration after a pre-upload interruption', () => {
    fixture.file(config + '/docker-provision/token', token);
    fixture.file(config + '/docker-provision/mode', 'destructive');
    expect(fixture.run(runtimeBundleRecoveryScript(fixture.root, token)).stderr).toContain('Unowned staged');
    expect(fixture.read(config + '/runtime.env.next')).toBe('NEW=enrollment');
  });

  registerRejectsAnUntrustedPreparationJournalBeforeUsingItsRecoveryOwnership(scope);

  registerPublishesRecoveryOwnershipAtomicallyWhenInterruptedBeforeTheReceiptRename(scope);

  registerContainsValidLegacyTransactionsWithoutRestoringTheirPriorContainerOrData(scope);

  it('retains corrupt metadata and never treats it as permission to delete unowned state', () => {
    expect(install().status).toBe(0);
    fixture.file(tx + '/old-id', 'valid\n../../other\n');
    expect(recover().status).not.toBe(0);
    expect(existsSync(join(fixture.root, tx))).toBe(true);
  });

  registerSerializesDeliveryWhileAStreamIsStillReceivingBytesUsingRealFlock(scope);

  it('receiver rejects invalid script encoding and cleans its private directory', () => {
    const r = fixture.run(runtimeBundleStreamReceiver, '', Buffer.from('not-base64!\n'));
    expect(r.status).not.toBe(0);
    expect(fixture.containers()).toEqual([]);
  });

  registerWaitsForAnActiveRuntimeMonitorBeforeCleaningUpItsRetainedInstallation(scope);

  return scope;
}

export type DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope = ReturnType<
  typeof defineDestructiveRuntimeShellTransactionAndOfflineStreamFixturesTests
>;
