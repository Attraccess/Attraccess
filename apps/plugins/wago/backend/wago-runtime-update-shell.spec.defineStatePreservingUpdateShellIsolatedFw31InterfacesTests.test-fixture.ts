import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { BuildRuntimeArtifact } from './wago-build-runtime';
import {
  runtimeUpdateStageScript,
  runtimeUpdateActivateScript,
  runtimeUpdateRollbackScript,
  runtimeUpdateAcknowledgeScript,
} from './wago-runtime-update-shell';
import { WAGO_DIN, WAGO_DOUT } from './wago-hardware-deployment';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesWaitsForASupervisorGateBeforeStagingInsteadOfReportingATransferFailure } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-waits-for-a-supervisor-gate-before-staging-instead-of-reporting-a-transfer-failure.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesExpiresABusyControllerWaitBeforeCreatingAnUpdateJournalOrStoppingTheRuntime } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-expires-a-busy-controller-wait-before-creating-an-update-journal-or-stopping-the-runtime.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesLoadsBeforeStoppingPreservesCredentialsConfigurationAndRetainsThePriorRuntimeUntilAcknow } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-loads-before-stopping-preserves-credentials-configuration-and-retains-the-prior-runtime-until-acknow.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesDoesNotChargeTheUnusedTemporaryFilesystemForADirectUpdateTransfer } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-does-not-charge-the-unused-temporary-filesystem-for-a-direct-update-transfer.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesReclaimsTheRetiredImageOnlyAfterAcceptanceIsDurablyAcknowledged } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-reclaims-the-retired-image-only-after-acceptance-is-durably-acknowledged.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesReclaimsAFailedLoadedCandidateAfterRollbackAcknowledgement } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-reclaims-a-failed-loaded-candidate-after-rollback-acknowledgement.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesRetainsARetiredImageStillReferencedByAnUnrelatedStoppedContainer } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-retains-a-retired-image-still-referenced-by-an-unrelated-stopped-container.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesResumesAcknowledgementAfterTheUnusedImageWasRemovedButBeforeTheReceiptWasRemoved } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-resumes-acknowledgement-after-the-unused-image-was-removed-but-before-the-receipt-was-removed.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesRejectsMalformedRetiredImageMetadataInsteadOfIssuingADockerRemoval } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-rejects-malformed-retired-image-metadata-instead-of-issuing-a-docker-removal.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesRetainsAcknowledgementOwnershipOnSAndRetriesImageCleanupSafely } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-retains-acknowledgement-ownership-on-s-and-retries-image-cleanup-safely.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesReceivesTheVerifiedBundleWhenFw31HeadHasNoByteCountOption } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-receives-the-verified-bundle-when-fw31-head-has-no-byte-count-option.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesDoesNotMistakeShortDdInputBlocksForTheEndOfAValidTransfer } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-does-not-mistake-short-dd-input-blocks-for-the-end-of-a-valid-transfer.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesRejectsFailedImageExtractionEvenIfDockerAcceptsThePartialInput } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-rejects-failed-image-extraction-even-if-docker-accepts-the-partial-input.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesRestoresThePriorContainerAndItsStoppedStateCheckpointAfterReadinessFailureOrReboot } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-restores-the-prior-container-and-its-stopped-state-checkpoint-after-readiness-failure-or-reboot.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesLeavesTheCurrentRuntimeUntouchedOnStagingSFailure } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-leaves-the-current-runtime-untouched-on-staging-s-failure.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesRejectsSTransfersBeforeLoading } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-rejects-s-transfers-before-loading.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesChecksDockerIdentityPlatformRatherThanTrustingTheTarReference } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-checks-docker-identity-platform-rather-than-trusting-the-tar-reference.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesRecoversAFailedOrInterruptedSWithoutReenrollment } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-recovers-a-failed-or-interrupted-s-without-reenrollment.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesSerializesStagingAgainstDestructiveCommissioningAndRejectsAForeignUpdateToken } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-serializes-staging-against-destructive-commissioning-and-rejects-a-foreign-update-token.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesResumesPartialCleanupWithoutRequiringMetadataAlreadyDeletedByTheInterruptedCleanup } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-resumes-partial-cleanup-without-requiring-metadata-already-deleted-by-the-interrupted-cleanup.test-cases';
import { registerStatePreservingUpdateShellIsolatedFw31InterfacesRejectsMountedStateBeforeStagingBecauseCheckpointRestoreMustBeAnAtomicRename } from './wago-runtime-update-shell.state-preserving-update-shell-isolated-fw31-interfaces-rejects-mounted-state-before-staging-because-checkpoint-restore-must-be-an-atomic-rename.test-cases';
const token = 'a'.repeat(32);
const imageId = `sha256:${'b'.repeat(64)}`;
const previousImageId = `sha256:${'c'.repeat(64)}`;
const image = `ghcr.io/attraccess/wago-cc100-runtime@${imageId}`;
const profile = 'cc100-751-9301-fw31-digital-v1';

export function defineStatePreservingUpdateShellIsolatedFw31InterfacesTests() {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  let artifact: BuildRuntimeArtifact;
  let bundle: Buffer;
  const config = 'etc/attraccess-wago';
  const data = 'var/lib/attraccess-wago';
  const tx = 'var/lib/attraccess-wago-update-transaction';
  const stage = (fault = '', input = bundle) =>
    fixture.run(runtimeUpdateStageScript(artifact, token, fixture.root), fault, input);
  const activate = (fault = '') => fixture.run(runtimeUpdateActivateScript(token, profile, fixture.root), fault);
  const rollback = () => fixture.run(runtimeUpdateRollbackScript(token, profile, previousImageId, fixture.root));
  const acknowledge = () => fixture.run(runtimeUpdateAcknowledgeScript(token, profile, fixture.root));
  const success = (result: ReturnType<typeof fixture.run>) =>
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });

  beforeEach(() => {
    fixture = fw31ShellFixture();
    fixture.file(
      'etc/rc.d/S99_zz_attraccess_wago',
      fixture.read('etc/rc.d/S99_zz_attraccess_wago') + '\n# previous-build-hook\n',
      0o700,
    );
    fixture.file(config + '/runtime.env', 'WAGO_HARDWARE_ID=enrolled\nWAGO_MQTT_PASSWORD=permanent-fixture-secret');
    fixture.file(config + '/runtime-enabled', '');
    fixture.file(data + '/credentials.json', 'permanent-credentials');
    fixture.file(data + '/state.json', 'accepted-configuration');
    fixture.file(
      'owners.json',
      JSON.stringify({ ...JSON.parse(fixture.read('owners.json')), ['/var/lib/attraccess-wago']: '10001:10001' }),
    );
    fixture.setContainers([
      {
        id: 'old-id',
        name: 'attraccess-wago',
        running: true,
        restart: 'no',
        imageId: previousImageId,
        mounts: [fixture.root + WAGO_DIN, fixture.root + WAGO_DOUT],
      },
    ]);
    fixture.file('loaded-image-id', imageId);
    fixture.file('bundle/image-reference', image + '\n');
    fixture.file('bundle/image.tar', 'compressed fixture image bytes');
    const archive = join(fixture.root, 'tmp/update.tar');
    expect(
      spawnSync('/usr/bin/tar', ['-cf', archive, '-C', join(fixture.root, 'bundle'), 'image-reference', 'image.tar'])
        .status,
    ).toBe(0);
    bundle = readFileSync(archive);
    artifact = {
      imageId,
      image,
      buildId: 'a'.repeat(40),
      digest: createHash('sha256').update(bundle).digest('hex'),
      bytes: bundle.length,
      manifest: {
        schemaVersion: 1,
        runtime: 'attraccess-wago-cc100',
        runtimeVersion: '0.1.0',
        protocolVersion: '1.0.0',
        image,
        hardware: { model: '751-9301', platform: 'linux/arm/v7', firmwareBaseline: '31', profile },
      },
    };
  });
  afterEach(() => fixture.dispose());
  const scope = {
    get success() {
      return success;
    },
    get stage() {
      return stage;
    },
    get fixture() {
      return fixture;
    },
    set fixture(value: typeof fixture) {
      fixture = value;
    },
    get tx() {
      return tx;
    },
    get previousImageId() {
      return previousImageId;
    },
    get data() {
      return data;
    },
    get activate() {
      return activate;
    },
    get profile(): typeof profile {
      return profile;
    },
    get config() {
      return config;
    },
    get imageId() {
      return imageId;
    },
    get token() {
      return token;
    },
    get acknowledge() {
      return acknowledge;
    },
    get rollback() {
      return rollback;
    },
    get bundle() {
      return bundle;
    },
    set bundle(value: typeof bundle) {
      bundle = value;
    },
    get image() {
      return image;
    },
    get artifact() {
      return artifact;
    },
    set artifact(value: typeof artifact) {
      artifact = value;
    },
  };

  registerStatePreservingUpdateShellIsolatedFw31InterfacesWaitsForASupervisorGateBeforeStagingInsteadOfReportingATransferFailure(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesExpiresABusyControllerWaitBeforeCreatingAnUpdateJournalOrStoppingTheRuntime(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesLoadsBeforeStoppingPreservesCredentialsConfigurationAndRetainsThePriorRuntimeUntilAcknow(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesDoesNotChargeTheUnusedTemporaryFilesystemForADirectUpdateTransfer(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesReclaimsTheRetiredImageOnlyAfterAcceptanceIsDurablyAcknowledged(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesReclaimsAFailedLoadedCandidateAfterRollbackAcknowledgement(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesRetainsARetiredImageStillReferencedByAnUnrelatedStoppedContainer(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesResumesAcknowledgementAfterTheUnusedImageWasRemovedButBeforeTheReceiptWasRemoved(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesRejectsMalformedRetiredImageMetadataInsteadOfIssuingADockerRemoval(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesRetainsAcknowledgementOwnershipOnSAndRetriesImageCleanupSafely(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesReceivesTheVerifiedBundleWhenFw31HeadHasNoByteCountOption(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesDoesNotMistakeShortDdInputBlocksForTheEndOfAValidTransfer(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesRejectsFailedImageExtractionEvenIfDockerAcceptsThePartialInput(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesRestoresThePriorContainerAndItsStoppedStateCheckpointAfterReadinessFailureOrReboot(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesLeavesTheCurrentRuntimeUntouchedOnStagingSFailure(scope);

  registerStatePreservingUpdateShellIsolatedFw31InterfacesRejectsSTransfersBeforeLoading(scope);

  registerStatePreservingUpdateShellIsolatedFw31InterfacesChecksDockerIdentityPlatformRatherThanTrustingTheTarReference(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesRecoversAFailedOrInterruptedSWithoutReenrollment(scope);

  registerStatePreservingUpdateShellIsolatedFw31InterfacesSerializesStagingAgainstDestructiveCommissioningAndRejectsAForeignUpdateToken(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesResumesPartialCleanupWithoutRequiringMetadataAlreadyDeletedByTheInterruptedCleanup(
    scope,
  );

  registerStatePreservingUpdateShellIsolatedFw31InterfacesRejectsMountedStateBeforeStagingBecauseCheckpointRestoreMustBeAnAtomicRename(
    scope,
  );

  return scope;
}
