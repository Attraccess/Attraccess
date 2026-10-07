import { WagoRuntimeUpdateCoordinator } from './wago-runtime-update';
import { ManagedRuntimeUpdateHost, RuntimeUpdateRecord, RuntimeUpdateStore } from './wago-runtime-update';
import { BuildRuntimeArtifact } from './wago-build-runtime';
import { registerDurableManagedRuntimeReconciliationUpdatesImmediatelyWhenAFreshHeartbeatContradictsACurrentCheckpoint } from './wago-runtime-update.durable-managed-runtime-reconciliation-updates-immediately-when-a-fresh-heartbeat-contradicts-a-current-checkpoint.test-cases';
import { registerDurableManagedRuntimeReconciliationRetainsBeforeAfterVersionsAcrossCompletionAnInspectionFailureAndCurrentImageRechecks } from './wago-runtime-update.durable-managed-runtime-reconciliation-retains-before-after-versions-across-completion-an-inspection-failure-and-current-image-rechecks.test-cases';
import { registerDurableManagedRuntimeReconciliationDefersSettledCurrentSshWorkDurablyAlreadyCurrentSButChecksANewBuildImmediately } from './wago-runtime-update.durable-managed-runtime-reconciliation-defers-settled-current-ssh-work-durably-already-current-s-but-checks-a-new-build-immediately.test-cases';
import { registerDurableManagedRuntimeReconciliationRechecksCurrentRuntimeHealthWhenItsBoundedSteadyStateDeadlineExpires } from './wago-runtime-update.durable-managed-runtime-reconciliation-rechecks-current-runtime-health-when-its-bounded-steady-state-deadline-expires.test-cases';
import { registerDurableManagedRuntimeReconciliationAdministratorRetryAdvancesBackoffWithoutDiscardingTheRollbackToken } from './wago-runtime-update.durable-managed-runtime-reconciliation-administrator-retry-advances-backoff-without-discarding-the-rollback-token.test-cases';
import { registerDurableManagedRuntimeReconciliationAdministratorRetryHonorsRetainedAcceptedCleanupBeforeStagingANewRelease } from './wago-runtime-update.durable-managed-runtime-reconciliation-administrator-retry-honors-retained-accepted-cleanup-before-staging-a-new-release.test-cases';
import { registerDurableManagedRuntimeReconciliationPersistsAndAuditsInstallerPreparationBeforePublicationAndAuditFailurePreventsIt } from './wago-runtime-update.durable-managed-runtime-reconciliation-persists-and-audits-installer-preparation-before-publication-and-audit-failure-prevents-it.test-cases';
import { registerDurableManagedRuntimeReconciliationPersistsAndAuditsIntentBeforeEachRemoteEffectAndMarksCurrentOnlyAfterFreshReadiness } from './wago-runtime-update.durable-managed-runtime-reconciliation-persists-and-audits-intent-before-each-remote-effect-and-marks-current-only-after-fresh-readiness.test-cases';
import { registerDurableManagedRuntimeReconciliationNeverRestartsForRecompressionANewTagOrANewServerBuildWithTheSameImage } from './wago-runtime-update.durable-managed-runtime-reconciliation-never-restarts-for-recompression-a-new-tag-or-a-new-server-build-with-the-same-image.test-cases';
import { registerDurableManagedRuntimeReconciliationKeepsTheInstalledImageForARebuiltReleaseWithTheSameRuntimeVersionIncludingAfterRestar } from './wago-runtime-update.durable-managed-runtime-reconciliation-keeps-the-installed-image-for-a-rebuilt-release-with-the-same-runtime-version-including-after-restar.test-cases';
import { registerDurableManagedRuntimeReconciliationStillRequiresReadinessForAnInstalledImageWithTheSameRuntimeVersion } from './wago-runtime-update.durable-managed-runtime-reconciliation-still-requires-readiness-for-an-installed-image-with-the-same-runtime-version.test-cases';
import { registerDurableManagedRuntimeReconciliationRequiresFreshPermanentReadinessEvenForAnIdenticalImageJ } from './wago-runtime-update.durable-managed-runtime-reconciliation-requires-fresh-permanent-readiness-even-for-an-identical-image-j.test-cases';
import { registerDurableManagedRuntimeReconciliationRecordsAVisibleBlockerAndRetriesWithDurableBackoffJ } from './wago-runtime-update.durable-managed-runtime-reconciliation-records-a-visible-blocker-and-retries-with-durable-backoff-j.test-cases';
import { registerDurableManagedRuntimeReconciliationReResolvesTheDesiredImageOnRetryBypassingTheOldBuildBackoff } from './wago-runtime-update.durable-managed-runtime-reconciliation-re-resolves-the-desired-image-on-retry-bypassing-the-old-build-backoff.test-cases';
import { registerDurableManagedRuntimeReconciliationRecoversIfTheDesiredImageChangesDuringS } from './wago-runtime-update.durable-managed-runtime-reconciliation-recovers-if-the-desired-image-changes-during-s.test-cases';
import { registerDurableManagedRuntimeReconciliationPreservesThePriorImageOnSFailure } from './wago-runtime-update.durable-managed-runtime-reconciliation-preserves-the-prior-image-on-s-failure.test-cases';
import { registerDurableManagedRuntimeReconciliationRetainsActionableStorageFiguresAfterRecoveryAndClearsThemOnASuccessfulRetry } from './wago-runtime-update.durable-managed-runtime-reconciliation-retains-actionable-storage-figures-after-recovery-and-clears-them-on-a-successful-retry.test-cases';
import { registerDurableManagedRuntimeReconciliationRejectsIncompleteRetainedOrWrongImageReadinessJ } from './wago-runtime-update.durable-managed-runtime-reconciliation-rejects-incomplete-retained-or-wrong-image-readiness-j.test-cases';
import { registerDurableManagedRuntimeReconciliationRetainsTheTokenAcrossFailedRecoveryAndRecoversBeforeStagingOnRestart } from './wago-runtime-update.durable-managed-runtime-reconciliation-retains-the-token-across-failed-recovery-and-recovers-before-staging-on-restart.test-cases';
import { registerDurableManagedRuntimeReconciliationGivesANewRolloutItsOwnDeadlineAfterSlowCrashRecoveryAndAcknowledgement } from './wago-runtime-update.durable-managed-runtime-reconciliation-gives-a-new-rollout-its-own-deadline-after-slow-crash-recovery-and-acknowledgement.test-cases';
import { registerDurableManagedRuntimeReconciliationResumesAcknowledgementAfterInterruptionWithoutRollingBackAnAcceptedRollout } from './wago-runtime-update.durable-managed-runtime-reconciliation-resumes-acknowledgement-after-interruption-without-rolling-back-an-accepted-rollout.test-cases';
import { registerDurableManagedRuntimeReconciliationBoundsFleetConcurrencyIsolatesFailuresAndCoalescesDuplicateControllerWork } from './wago-runtime-update.durable-managed-runtime-reconciliation-bounds-fleet-concurrency-isolates-failures-and-coalesces-duplicate-controller-work.test-cases';
import { registerDurableManagedRuntimeReconciliationStopsMutationAfterCancellationAndLeavesDurableRecoveryIntent } from './wago-runtime-update.durable-managed-runtime-reconciliation-stops-mutation-after-cancellation-and-leaves-durable-recovery-intent.test-cases';
import { registerDurableManagedRuntimeReconciliationWaitsForCancelledTransportAndConditionalLeaseReleaseBeforeShutdownResolves } from './wago-runtime-update.durable-managed-runtime-reconciliation-waits-for-cancelled-transport-and-conditional-lease-release-before-shutdown-resolves.test-cases';
import { resetTestFixture } from './wago-runtime-update.setup.test-fixture';
import { release } from './wago-runtime-update.spec.release';

export function defineDurableManagedRuntimeReconciliationTests() {
  let now: number;
  let desired: BuildRuntimeArtifact;
  let rows: Map<number, RuntimeUpdateRecord>;
  let owners: Map<number, string>;
  let store: RuntimeUpdateStore;
  let host: jest.Mocked<ManagedRuntimeUpdateHost>;
  let audit: jest.Mock;
  let coordinator: WagoRuntimeUpdateCoordinator;
  beforeEach(() => {
    resetTestFixture(scope);
  });
  afterEach(() => coordinator.stop());
  const scope = {
    get coordinator() {
      return coordinator;
    },
    set coordinator(value: typeof coordinator) {
      coordinator = value;
    },
    get host() {
      return host;
    },
    set host(value: typeof host) {
      host = value;
    },
    get release() {
      return release;
    },
    get desired() {
      return desired;
    },
    set desired(value: typeof desired) {
      desired = value;
    },
    get rows() {
      return rows;
    },
    set rows(value: typeof rows) {
      rows = value;
    },
    get now() {
      return now;
    },
    set now(value: typeof now) {
      now = value;
    },
    get store() {
      return store;
    },
    set store(value: typeof store) {
      store = value;
    },
    get audit() {
      return audit;
    },
    set audit(value: typeof audit) {
      audit = value;
    },
    get owners() {
      return owners;
    },
    set owners(value: typeof owners) {
      owners = value;
    },
  };

  registerDurableManagedRuntimeReconciliationUpdatesImmediatelyWhenAFreshHeartbeatContradictsACurrentCheckpoint(scope);

  registerDurableManagedRuntimeReconciliationRetainsBeforeAfterVersionsAcrossCompletionAnInspectionFailureAndCurrentImageRechecks(
    scope,
  );

  registerDurableManagedRuntimeReconciliationDefersSettledCurrentSshWorkDurablyAlreadyCurrentSButChecksANewBuildImmediately(
    scope,
  );

  registerDurableManagedRuntimeReconciliationRechecksCurrentRuntimeHealthWhenItsBoundedSteadyStateDeadlineExpires(
    scope,
  );

  registerDurableManagedRuntimeReconciliationAdministratorRetryAdvancesBackoffWithoutDiscardingTheRollbackToken(scope);

  registerDurableManagedRuntimeReconciliationAdministratorRetryHonorsRetainedAcceptedCleanupBeforeStagingANewRelease(
    scope,
  );

  registerDurableManagedRuntimeReconciliationPersistsAndAuditsInstallerPreparationBeforePublicationAndAuditFailurePreventsIt(
    scope,
  );

  registerDurableManagedRuntimeReconciliationPersistsAndAuditsIntentBeforeEachRemoteEffectAndMarksCurrentOnlyAfterFreshReadiness(
    scope,
  );

  registerDurableManagedRuntimeReconciliationNeverRestartsForRecompressionANewTagOrANewServerBuildWithTheSameImage(
    scope,
  );

  registerDurableManagedRuntimeReconciliationKeepsTheInstalledImageForARebuiltReleaseWithTheSameRuntimeVersionIncludingAfterRestar(
    scope,
  );

  registerDurableManagedRuntimeReconciliationStillRequiresReadinessForAnInstalledImageWithTheSameRuntimeVersion(scope);

  registerDurableManagedRuntimeReconciliationRequiresFreshPermanentReadinessEvenForAnIdenticalImageJ(scope);

  registerDurableManagedRuntimeReconciliationRecordsAVisibleBlockerAndRetriesWithDurableBackoffJ(scope);

  registerDurableManagedRuntimeReconciliationReResolvesTheDesiredImageOnRetryBypassingTheOldBuildBackoff(scope);

  registerDurableManagedRuntimeReconciliationRecoversIfTheDesiredImageChangesDuringS(scope);

  registerDurableManagedRuntimeReconciliationPreservesThePriorImageOnSFailure(scope);

  registerDurableManagedRuntimeReconciliationRetainsActionableStorageFiguresAfterRecoveryAndClearsThemOnASuccessfulRetry(
    scope,
  );

  registerDurableManagedRuntimeReconciliationRejectsIncompleteRetainedOrWrongImageReadinessJ(scope);

  registerDurableManagedRuntimeReconciliationRetainsTheTokenAcrossFailedRecoveryAndRecoversBeforeStagingOnRestart(
    scope,
  );

  registerDurableManagedRuntimeReconciliationGivesANewRolloutItsOwnDeadlineAfterSlowCrashRecoveryAndAcknowledgement(
    scope,
  );

  registerDurableManagedRuntimeReconciliationResumesAcknowledgementAfterInterruptionWithoutRollingBackAnAcceptedRollout(
    scope,
  );

  registerDurableManagedRuntimeReconciliationBoundsFleetConcurrencyIsolatesFailuresAndCoalescesDuplicateControllerWork(
    scope,
  );

  registerDurableManagedRuntimeReconciliationStopsMutationAfterCancellationAndLeavesDurableRecoveryIntent(scope);

  registerDurableManagedRuntimeReconciliationWaitsForCancelledTransportAndConditionalLeaseReleaseBeforeShutdownResolves(
    scope,
  );

  return scope;
}
