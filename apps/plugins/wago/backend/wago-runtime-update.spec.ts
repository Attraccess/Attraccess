import { WagoRuntimeUpdateCoordinator } from './wago-runtime-update';
import type { ManagedRuntimeUpdateHost, RuntimeUpdateRecord, RuntimeUpdateStore } from './wago-runtime-update';
import type { BuildRuntimeArtifact } from './wago-build-runtime';
import { registerUpdatesImmediatelyWhenAFreshHeartbeatContradictsACurrentCheckpoint } from "./wago-runtime-update.updates-immediately-when-a-fresh-heartbeat-contradicts-a-current-checkpoint.test-cases";
import { registerRetainsBeforeAfterVersionsAcrossCompletionAnInspectionFailureAndCurrentImageRechecks } from "./wago-runtime-update.retains-before-after-versions-across-completion-an-inspection-failure-and-current-image-rechecks.test-cases";
import { registerDefersSettledCurrentSshWorkDurablyAlreadyCurrentSButChecksANewBuildImmediately } from "./wago-runtime-update.defers-settled-current-ssh-work-durably-already-current-s-but-checks-a-new-build-immediately.test-cases";
import { registerRechecksCurrentRuntimeHealthWhenItsBoundedSteadyStateDeadlineExpires } from "./wago-runtime-update.rechecks-current-runtime-health-when-its-bounded-steady-state-deadline-expires.test-cases";
import { registerAdministratorRetryAdvancesBackoffWithoutDiscardingTheRollbackToken } from "./wago-runtime-update.administrator-retry-advances-backoff-without-discarding-the-rollback-token.test-cases";
import { registerAdministratorRetryHonorsRetainedAcceptedCleanupBeforeStagingANewRelease } from "./wago-runtime-update.administrator-retry-honors-retained-accepted-cleanup-before-staging-a-new-release.test-cases";
import { registerPersistsAndAuditsInstallerPreparationBeforePublicationAndAuditFailurePreventsIt } from "./wago-runtime-update.persists-and-audits-installer-preparation-before-publication-and-audit-failure-prevents-it.test-cases";
import { registerPersistsAndAuditsIntentBeforeEachRemoteEffectAndMarksCurrentOnlyAfterFreshReadiness } from "./wago-runtime-update.persists-and-audits-intent-before-each-remote-effect-and-marks-current-only-after-fresh-readiness.test-cases";
import { registerNeverRestartsForRecompressionANewTagOrANewServerBuildWithTheSameImage } from "./wago-runtime-update.never-restarts-for-recompression-a-new-tag-or-a-new-server-build-with-the-same-image.test-cases";
import { registerRequiresFreshPermanentReadinessEvenForAnIdenticalImageJ } from "./wago-runtime-update.requires-fresh-permanent-readiness-even-for-an-identical-image-j.test-cases";
import { registerRecordsAVisibleBlockerAndRetriesWithDurableBackoffJ } from "./wago-runtime-update.records-a-visible-blocker-and-retries-with-durable-backoff-j.test-cases";
import { registerReResolvesTheDesiredImageOnRetryBypassingTheOldBuildBackoff } from "./wago-runtime-update.re-resolves-the-desired-image-on-retry-bypassing-the-old-build-backoff.test-cases";
import { registerRecoversIfTheDesiredImageChangesDuringS } from "./wago-runtime-update.recovers-if-the-desired-image-changes-during-s.test-cases";
import { registerPreservesThePriorImageOnSFailure } from "./wago-runtime-update.preserves-the-prior-image-on-s-failure.test-cases";
import { registerRetainsActionableStorageFiguresAfterRecoveryAndClearsThemOnASuccessfulRetry } from "./wago-runtime-update.retains-actionable-storage-figures-after-recovery-and-clears-them-on-a-successful-retry.test-cases";
import { registerRejectsIncompleteRetainedOrWrongImageReadinessJ } from "./wago-runtime-update.rejects-incomplete-retained-or-wrong-image-readiness-j.test-cases";
import { registerRetainsTheTokenAcrossFailedRecoveryAndRecoversBeforeStagingOnRestart } from "./wago-runtime-update.retains-the-token-across-failed-recovery-and-recovers-before-staging-on-restart.test-cases";
import { registerGivesANewRolloutItsOwnDeadlineAfterSlowCrashRecoveryAndAcknowledgement } from "./wago-runtime-update.gives-a-new-rollout-its-own-deadline-after-slow-crash-recovery-and-acknowledgement.test-cases";
import { registerResumesAcknowledgementAfterInterruptionWithoutRollingBackAnAcceptedRollout } from "./wago-runtime-update.resumes-acknowledgement-after-interruption-without-rolling-back-an-accepted-rollout.test-cases";
import { registerBoundsFleetConcurrencyIsolatesFailuresAndCoalescesDuplicateControllerWork } from "./wago-runtime-update.bounds-fleet-concurrency-isolates-failures-and-coalesces-duplicate-controller-work.test-cases";
import { registerStopsMutationAfterCancellationAndLeavesDurableRecoveryIntent } from "./wago-runtime-update.stops-mutation-after-cancellation-and-leaves-durable-recovery-intent.test-cases";
import { registerWaitsForCancelledTransportAndConditionalLeaseReleaseBeforeShutdownResolves } from "./wago-runtime-update.waits-for-cancelled-transport-and-conditional-lease-release-before-shutdown-resolves.test-cases";

function release(id: string): BuildRuntimeArtifact {
  return {
    buildId: id.repeat(40),
    imageId: `sha256:${id.repeat(64)}`,
    digest: id.repeat(64),
    bytes: 8192,
    image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${id.repeat(64)}`,
    manifest: {
      schemaVersion: 1,
      runtime: 'attraccess-wago-cc100',
      runtimeVersion: '0.1.0',
      protocolVersion: '1.0.0',
      image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${id.repeat(64)}`,
      hardware: {
        model: '751-9301',
        platform: 'linux/arm/v7',
        firmwareBaseline: '31',
        profile: 'cc100-751-9301-fw31-digital-v1',
      },
    },
  };
}

describe('durable managed runtime reconciliation', () => { defineDurableManagedRuntimeReconciliationTests(); });

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
        now = 1_000_000;
        desired = release('b');
        rows = new Map();
        owners = new Map();
        store = {
          acquire: async (id, owner) => {
            if (owners.has(id)) return false;
            owners.set(id, owner);
            return true;
          },
          load: async (id) => {
            const row = rows.get(id);
            return row ? { ...row } : null;
          },
          save: async (row, owner) => {
            if (owners.get(row.controllerId) !== owner) throw new Error('lease_lost');
            rows.set(row.controllerId, { ...row });
          },
          release: async (id, owner) => {
            if (owners.get(id) === owner) owners.delete(id);
          },
        };
        host = {
          inspect: jest.fn<
            ReturnType<ManagedRuntimeUpdateHost['inspect']>,
            Parameters<ManagedRuntimeUpdateHost['inspect']>
          >(async () => ({ imageId: release('a').imageId, managed: true, claimed: true, compatible: true, online: true })),
          stage: jest.fn<ReturnType<ManagedRuntimeUpdateHost['stage']>, Parameters<ManagedRuntimeUpdateHost['stage']>>(
            async () => undefined,
          ),
          activate: jest.fn<
            ReturnType<ManagedRuntimeUpdateHost['activate']>,
            Parameters<ManagedRuntimeUpdateHost['activate']>
          >(async () => undefined),
          verify: jest.fn<ReturnType<ManagedRuntimeUpdateHost['verify']>, Parameters<ManagedRuntimeUpdateHost['verify']>>(
            async () => ({ imageId: desired.imageId, permanent: true, ready: true, observedAt: ++now }),
          ),
          accept: jest.fn<ReturnType<ManagedRuntimeUpdateHost['accept']>, Parameters<ManagedRuntimeUpdateHost['accept']>>(
            async () => undefined,
          ),
          acknowledge: jest.fn<
            ReturnType<ManagedRuntimeUpdateHost['acknowledge']>,
            Parameters<ManagedRuntimeUpdateHost['acknowledge']>
          >(async () => undefined),
          recover: jest.fn<
            ReturnType<ManagedRuntimeUpdateHost['recover']>,
            Parameters<ManagedRuntimeUpdateHost['recover']>
          >(async () => undefined),
        };
        audit = jest.fn(async () => undefined);
        coordinator = new WagoRuntimeUpdateCoordinator(
          store,
          async () => desired,
          host,
          audit,
          () => now,
        );
      });
      afterEach(() => coordinator.stop());
        const scope = {
        get coordinator() { return coordinator; },
        set coordinator(value: typeof coordinator) { coordinator = value; },
        get host() { return host; },
        set host(value: typeof host) { host = value; },
        release,
        get desired() { return desired; },
        set desired(value: typeof desired) { desired = value; },
        get rows() { return rows; },
        set rows(value: typeof rows) { rows = value; },
        get now() { return now; },
        set now(value: typeof now) { now = value; },
        get store() { return store; },
        set store(value: typeof store) { store = value; },
        get audit() { return audit; },
        set audit(value: typeof audit) { audit = value; },
        get owners() { return owners; },
        set owners(value: typeof owners) { owners = value; },
        };

      registerUpdatesImmediatelyWhenAFreshHeartbeatContradictsACurrentCheckpoint(scope);

      registerRetainsBeforeAfterVersionsAcrossCompletionAnInspectionFailureAndCurrentImageRechecks(scope);

      registerDefersSettledCurrentSshWorkDurablyAlreadyCurrentSButChecksANewBuildImmediately(scope);

      registerRechecksCurrentRuntimeHealthWhenItsBoundedSteadyStateDeadlineExpires(scope);

      registerAdministratorRetryAdvancesBackoffWithoutDiscardingTheRollbackToken(scope);

      registerAdministratorRetryHonorsRetainedAcceptedCleanupBeforeStagingANewRelease(scope);

      registerPersistsAndAuditsInstallerPreparationBeforePublicationAndAuditFailurePreventsIt(scope);

      registerPersistsAndAuditsIntentBeforeEachRemoteEffectAndMarksCurrentOnlyAfterFreshReadiness(scope);

      registerNeverRestartsForRecompressionANewTagOrANewServerBuildWithTheSameImage(scope);

      registerRequiresFreshPermanentReadinessEvenForAnIdenticalImageJ(scope);

      registerRecordsAVisibleBlockerAndRetriesWithDurableBackoffJ(scope);

      registerReResolvesTheDesiredImageOnRetryBypassingTheOldBuildBackoff(scope);

      registerRecoversIfTheDesiredImageChangesDuringS(scope);

      registerPreservesThePriorImageOnSFailure(scope);

      registerRetainsActionableStorageFiguresAfterRecoveryAndClearsThemOnASuccessfulRetry(scope);

      registerRejectsIncompleteRetainedOrWrongImageReadinessJ(scope);

      registerRetainsTheTokenAcrossFailedRecoveryAndRecoversBeforeStagingOnRestart(scope);

      registerGivesANewRolloutItsOwnDeadlineAfterSlowCrashRecoveryAndAcknowledgement(scope);

      registerResumesAcknowledgementAfterInterruptionWithoutRollingBackAnAcceptedRollout(scope);

      registerBoundsFleetConcurrencyIsolatesFailuresAndCoalescesDuplicateControllerWork(scope);

      registerStopsMutationAfterCancellationAndLeavesDurableRecoveryIntent(scope);

      registerWaitsForCancelledTransportAndConditionalLeaseReleaseBeforeShutdownResolves(scope);

    return scope;
}

export type DurableManagedRuntimeReconciliationTestScope = ReturnType<typeof defineDurableManagedRuntimeReconciliationTests>;
