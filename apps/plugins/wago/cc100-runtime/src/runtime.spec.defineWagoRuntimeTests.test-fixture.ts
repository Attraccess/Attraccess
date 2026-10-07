import { TestTransport } from './runtime.test-utils';
import { MemoryDeviceAdapter } from './adapters';
import { JsonStateStore, WagoRuntime } from './runtime';
import { registerWagoRuntimeForcesHoldPolicyOutputsOffAndRejectsWorkWhileTheServerRequiresAnotherImage } from './runtime.wago-runtime-forces-hold-policy-outputs-off-and-rejects-work-while-the-server-requires-another-image.test-cases';
import { registerWagoRuntimeRequiresFreshServerConfirmationAtStartupAndAfterReconnectRejectingRetainedConfirmations } from './runtime.wago-runtime-requires-fresh-server-confirmation-at-startup-and-after-reconnect-rejecting-retained-confirmations.test-cases';
import { registerWagoRuntimeRetainsImageApprovalWhileRetryingAFailedFailsafeShutdown } from './runtime.wago-runtime-retains-image-approval-while-retrying-a-failed-failsafe-shutdown.test-cases';
import { registerWagoRuntimeIgnoresMalformedCommandSWithoutPerformingDeviceWrites } from './runtime.wago-runtime-ignores-malformed-command-s-without-performing-device-writes.test-cases';
import { registerWagoRuntimeAppliesACompleteValidRetainedSnapshotAndReportsItsRevision } from './runtime.wago-runtime-applies-a-complete-valid-retained-snapshot-and-reports-its-revision.test-cases';
import { registerWagoRuntimePublishesTheRequiredRetainedDiscoveryAnnouncementAndPersistsAValidClaim } from './runtime.wago-runtime-publishes-the-required-retained-discovery-announcement-and-persists-a-valid-claim.test-cases';
import { registerWagoRuntimePreservesPersistedRuntimeStateWhenReceivingADiscoveryClaimBeforeStartup } from './runtime.wago-runtime-preserves-persisted-runtime-state-when-receiving-a-discovery-claim-before-startup.test-cases';
import { registerWagoRuntimeIncludesThePairingCodeInTheBackendCompatibleHeartbeat } from './runtime.wago-runtime-includes-the-pairing-code-in-the-backend-compatible-heartbeat.test-cases';
import { registerWagoRuntimeReportsItsLaunchImageIdentityThroughANonRetainedPermanentHeartbeat } from './runtime.wago-runtime-reports-its-launch-image-identity-through-a-non-retained-permanent-heartbeat.test-cases';
import { registerWagoRuntimeActivatesDisconnectHandlingBeforeAStalledInitialCanonicalHeartbeat } from './runtime.wago-runtime-activates-disconnect-handling-before-a-stalled-initial-canonical-heartbeat.test-cases';
import { registerWagoRuntimeRetriesInterruptedStartupWithoutReloadingStateOrDuplicatingEstablishedSubscriptions } from './runtime.wago-runtime-retries-interrupted-startup-without-reloading-state-or-duplicating-established-subscriptions.test-cases';
import { registerWagoRuntimeStartsWhenReservingInitialStateTelemetryFails } from './runtime.wago-runtime-starts-when-reserving-initial-state-telemetry-fails.test-cases';
import { registerWagoRuntimeAcceptsOpaqueServerDefinedProfileNames } from './runtime.wago-runtime-accepts-opaque-server-defined-profile-names.test-cases';
import { registerWagoRuntimeRejectsAnInvalidSnapshotWithoutReplacingTheLastValidConfiguration } from './runtime.wago-runtime-rejects-an-invalid-snapshot-without-replacing-the-last-valid-configuration.test-cases';
import { registerWagoRuntimeReportsMalformedSnapshotCapabilitiesInsteadOfThrowing } from './runtime.wago-runtime-reports-malformed-snapshot-capabilities-instead-of-throwing.test-cases';
import { registerWagoRuntimeRejectsMalformedChannelDefinitionsBeforeTheyCanReachDeviceControl } from './runtime.wago-runtime-rejects-malformed-channel-definitions-before-they-can-reach-device-control.test-cases';
import { registerWagoRuntimeRejectsInvalidMeasurementMetadataJ } from './runtime.wago-runtime-rejects-invalid-measurement-metadata-j.test-cases';
import { registerWagoRuntimeRejectsDuplicateLogicalChannelIds } from './runtime.wago-runtime-rejects-duplicate-logical-channel-ids.test-cases';
import { registerWagoRuntimeEvaluatesGuardsAgainstTheirPhysicalInput } from './runtime.wago-runtime-evaluates-guards-against-their-physical-input.test-cases';
import { registerWagoRuntimeReservesConcurrentCommandIdsBeforeDeviceWrites } from './runtime.wago-runtime-reserves-concurrent-command-ids-before-device-writes.test-cases';
import { registerWagoRuntimeRejectsExpiredCommandsBeforeWritingTheDevice } from './runtime.wago-runtime-rejects-expired-commands-before-writing-the-device.test-cases';
import { registerWagoRuntimeRejectsCommandsWithoutExpiryOrAConfigurationRevisionBeforeWritingTheDevice } from './runtime.wago-runtime-rejects-commands-without-expiry-or-a-configuration-revision-before-writing-the-device.test-cases';
import { registerWagoRuntimeRejectsPulsesOnSwitchedOutputsBeforeAnyDeviceWriteOrCommandReservation } from './runtime.wago-runtime-rejects-pulses-on-switched-outputs-before-any-device-write-or-command-reservation.test-cases';
import { registerWagoRuntimeRejectsStaleConfigurationRevisionsBeforeWritingTheDevice } from './runtime.wago-runtime-rejects-stale-configuration-revisions-before-writing-the-device.test-cases';
import { registerWagoRuntimeDoesNotRepeatAnUnexpiredPulseAfterARuntimeReboot } from './runtime.wago-runtime-does-not-repeat-an-unexpired-pulse-after-a-runtime-reboot.test-cases';
import { registerWagoRuntimeAllowsACommandIdToBeReusedAfterItsPersistedExpiry } from './runtime.wago-runtime-allows-a-command-id-to-be-reused-after-its-persisted-expiry.test-cases';
import { registerWagoRuntimeAllowsACommandToBeRetriedAfterAFailedDeviceWrite } from './runtime.wago-runtime-allows-a-command-to-be-retried-after-a-failed-device-write.test-cases';
import { registerWagoRuntimeDeactivatesAPulseWhenRetainedStatePublicationFailsAfterItTurnsOn } from './runtime.wago-runtime-deactivates-a-pulse-when-retained-state-publication-fails-after-it-turns-on.test-cases';
import { registerWagoRuntimeRetriesAFailedScheduledPulseShutdown } from './runtime.wago-runtime-retries-a-failed-scheduled-pulse-shutdown.test-cases';
import { registerWagoRuntimeKeepsActivePulsesUntilTheirDeadlineAfterApplyingAReplacementConfiguration } from './runtime.wago-runtime-keeps-active-pulses-until-their-deadline-after-applying-a-replacement-configuration.test-cases';
import { registerWagoRuntimeAppliesConfigurationWhileAScheduledPulseShutdownKeepsRetrying } from './runtime.wago-runtime-applies-configuration-while-a-scheduled-pulse-shutdown-keeps-retrying.test-cases';
import { registerWagoRuntimeShutsDownAPulseThatCompletesWhileConfigurationReplacementIsWaiting } from './runtime.wago-runtime-shuts-down-a-pulse-that-completes-while-configuration-replacement-is-waiting.test-cases';
import { registerWagoRuntimeSerializesDesiredConfigurationReplacementsInArrivalOrder } from './runtime.wago-runtime-serializes-desired-configuration-replacements-in-arrival-order.test-cases';
import { registerWagoRuntimeRejectsSetSWithoutCancellingAPendingPulseShutdown } from './runtime.wago-runtime-rejects-set-s-without-cancelling-a-pending-pulse-shutdown.test-cases';
import { registerWagoRuntimeSerializesCommandsForOneChannelInArrivalOrder } from './runtime.wago-runtime-serializes-commands-for-one-channel-in-arrival-order.test-cases';
import { registerWagoRuntimeReportsConfiguredFeedbackMismatchesAfterOutputWrites } from './runtime.wago-runtime-reports-configured-feedback-mismatches-after-output-writes.test-cases';
import { registerWagoRuntimeStartsFeedbackVerificationBeforeRetainedStatePublicationCompletes } from './runtime.wago-runtime-starts-feedback-verification-before-retained-state-publication-completes.test-cases';
import { registerWagoRuntimeRejectsACommandThatWaitsBehindAWriteWhenItsConfigurationChanges } from './runtime.wago-runtime-rejects-a-command-that-waits-behind-a-write-when-its-configuration-changes.test-cases';
import { registerWagoRuntimeDoesNotAcknowledgeAPulseWhenPersistingItsOutputStateFails } from './runtime.wago-runtime-does-not-acknowledge-a-pulse-when-persisting-its-output-state-fails.test-cases';
import { registerWagoRuntimeKeepsThePreviousConfigurationActiveWhenPersistingAReplacementFails } from './runtime.wago-runtime-keeps-the-previous-configuration-active-when-persisting-a-replacement-fails.test-cases';
import { registerWagoRuntimePersistsACommandReservationBeforeActuatingTheDevice } from './runtime.wago-runtime-persists-a-command-reservation-before-actuating-the-device.test-cases';
import { registerWagoRuntimeAcknowledgesDuplicateCommandsAndEnforcesImmediateDisconnectPolicy } from './runtime.wago-runtime-acknowledges-duplicate-commands-and-enforces-immediate-disconnect-policy.test-cases';
import { registerWagoRuntimeDoesNotPostponeAWatchdogShutdownForRepeatedDisconnectNotifications } from './runtime.wago-runtime-does-not-postpone-a-watchdog-shutdown-for-repeated-disconnect-notifications.test-cases';
import { registerWagoRuntimeCancelsAPendingWatchdogShutdownWhenReconnecting } from './runtime.wago-runtime-cancels-a-pending-watchdog-shutdown-when-reconnecting.test-cases';
import { registerWagoRuntimeRetriesTheAggregateImmediateShutdownStateAfterAStateStoreFailure } from './runtime.wago-runtime-retries-the-aggregate-immediate-shutdown-state-after-a-state-store-failure.test-cases';
import { registerWagoRuntimePersistsOutputAndConnectionStateChanges } from './runtime.wago-runtime-persists-output-and-connection-state-changes.test-cases';
import { registerWagoRuntimeRejectsNumericDigitalReadbackInsteadOfPublishingAFalseBoolean } from './runtime.wago-runtime-rejects-numeric-digital-readback-instead-of-publishing-a-false-boolean.test-cases';
import { registerWagoRuntimeExcludesFeedbackForOutputsRemovedFromTheActiveConfiguration } from './runtime.wago-runtime-excludes-feedback-for-outputs-removed-from-the-active-configuration.test-cases';
import { registerWagoRuntimeSerializesConcurrentStateSaves } from './runtime.wago-runtime-serializes-concurrent-state-saves.test-cases';
import { registerWagoRuntimePublishesTypedIntegerBaseUnitMeasurementsWithStreamIdentity } from './runtime.wago-runtime-publishes-typed-integer-base-unit-measurements-with-stream-identity.test-cases';
import { registerWagoRuntimeRoundsScaledFloatMeasurementsWithinFloatingPointPrecision } from './runtime.wago-runtime-rounds-scaled-float-measurements-within-floating-point-precision.test-cases';
import { registerWagoRuntimeRejectsLargeFractionalMeasurements } from './runtime.wago-runtime-rejects-large-fractional-measurements.test-cases';
import { registerWagoRuntimeUsesANewMeasurementStreamIdentityAfterARuntimeRestart } from './runtime.wago-runtime-uses-a-new-measurement-stream-identity-after-a-runtime-restart.test-cases';
import { registerWagoRuntimeShutsOffAnAcceptedPulseAfterANewerPulseFails } from './runtime.wago-runtime-shuts-off-an-accepted-pulse-after-a-newer-pulse-fails.test-cases';
import { registerWagoRuntimeShutsOffADelayedPulseAfterANewerPulseSucceeds } from './runtime.wago-runtime-shuts-off-a-delayed-pulse-after-a-newer-pulse-succeeds.test-cases';
import { registerWagoRuntimeDoesNotLetAStalePulseShutoffOverrideASetCommandAfterChangingToSwitchedBehavior } from './runtime.wago-runtime-does-not-let-a-stale-pulse-shutoff-override-a-set-command-after-changing-to-switched-behavior.test-cases';
import { registerWagoRuntimeReportsAFeedbackMismatchAfterTheConfiguredFeedbackTimeout } from './runtime.wago-runtime-reports-a-feedback-mismatch-after-the-configured-feedback-timeout.test-cases';
import { registerWagoRuntimeVerifiesFinalOffFeedbackSWhilePulseShutdownPersistenceIsPending } from './runtime.wago-runtime-verifies-final-off-feedback-s-while-pulse-shutdown-persistence-is-pending.test-cases';
import { registerWagoRuntimeCancelsFeedbackChecksSupersededByALaterOutputCommand } from './runtime.wago-runtime-cancels-feedback-checks-superseded-by-a-later-output-command.test-cases';
import { registerWagoRuntimeKeepsThePriorFeedbackCheckWhenAReplacementWriteFails } from './runtime.wago-runtime-keeps-the-prior-feedback-check-when-a-replacement-write-fails.test-cases';
import { registerWagoRuntimeKeepsFeedbackVerificationForASuccessfulWriteQueuedBeforeAFailedReplacement } from './runtime.wago-runtime-keeps-feedback-verification-for-a-successful-write-queued-before-a-failed-replacement.test-cases';
import { registerWagoRuntimeDoesNotPublishAMismatchFromASupersededInFlightFeedbackCheck } from './runtime.wago-runtime-does-not-publish-a-mismatch-from-a-superseded-in-flight-feedback-check.test-cases';
import { registerWagoRuntimeDoesNotPublishAFaultFromAnInFlightFeedbackCheckAfterReplacingConfiguration } from './runtime.wago-runtime-does-not-publish-a-fault-from-an-in-flight-feedback-check-after-replacing-configuration.test-cases';
import { registerWagoRuntimeCancelsFeedbackFromAWriteCompletedWhileConfigurationReplacementWaits } from './runtime.wago-runtime-cancels-feedback-from-a-write-completed-while-configuration-replacement-waits.test-cases';
import { registerWagoRuntimeRejectsCommandsBeyondThePerChannelWriteQueueLimit } from './runtime.wago-runtime-rejects-commands-beyond-the-per-channel-write-queue-limit.test-cases';
import { registerWagoRuntimeRejectsFeedbackThatReferencesTheOutputRatherThanAnInputChannel } from './runtime.wago-runtime-rejects-feedback-that-references-the-output-rather-than-an-input-channel.test-cases';
import { registerWagoRuntimeReservesOperationalMessageSequencesWithoutSavingForEveryMeasurement } from './runtime.wago-runtime-reserves-operational-message-sequences-without-saving-for-every-measurement.test-cases';
import { registerWagoRuntimePublishesCanonicalMeasurementsInABootStream } from './runtime.wago-runtime-publishes-canonical-measurements-in-a-boot-stream.test-cases';
import { registerWagoRuntimeDoesNotPublishFromASequenceRangeWhoseReservationFailedToSave } from './runtime.wago-runtime-does-not-publish-from-a-sequence-range-whose-reservation-failed-to-save.test-cases';
import { registerWagoRuntimeDoesNotLetAConcurrentStateSaveOverwriteASequenceReservation } from './runtime.wago-runtime-does-not-let-a-concurrent-state-save-overwrite-a-sequence-reservation.test-cases';
import { snapshot } from './runtime.spec.snapshot';
import { pulsedSnapshot } from './runtime.spec.pulsed-snapshot';
export function defineWagoRuntimeTests() {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  const desired = 'attraccess/wago/v1/controllers/cc100-1/configuration/desired';
  const commands = 'attraccess/wago/v1/controllers/cc100-1/commands';
  const validCommand = (overrides: Record<string, unknown> = {}) => ({
    id: 'command-1',
    expiresAt: '2099-01-01T00:00:00.000Z',
    expectedConfigurationRevision: 1,
    channelId: 'load',
    action: 'set',
    value: true,
    ...overrides,
  });

  beforeEach(async () => {
    transport = new TestTransport();
    device = new MemoryDeviceAdapter();
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      enrollmentSecret: 'enrollment-secret',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device,
    });
    await runtime.start();
  });
  const scope = {
    get snapshot() {
      return snapshot;
    },
    get transport() {
      return transport;
    },
    set transport(value: typeof transport) {
      transport = value;
    },
    get desired() {
      return desired;
    },
    get commands() {
      return commands;
    },
    get validCommand() {
      return validCommand;
    },
    get device() {
      return device;
    },
    set device(value: typeof device) {
      device = value;
    },
    get runtime() {
      return runtime;
    },
    set runtime(value: typeof runtime) {
      runtime = value;
    },
    get pulsedSnapshot() {
      return pulsedSnapshot;
    },
    get TestTransport() {
      return TestTransport;
    },
  };

  registerWagoRuntimeForcesHoldPolicyOutputsOffAndRejectsWorkWhileTheServerRequiresAnotherImage(scope);

  registerWagoRuntimeRequiresFreshServerConfirmationAtStartupAndAfterReconnectRejectingRetainedConfirmations(scope);

  registerWagoRuntimeRetainsImageApprovalWhileRetryingAFailedFailsafeShutdown(scope);

  registerWagoRuntimeIgnoresMalformedCommandSWithoutPerformingDeviceWrites(scope);

  registerWagoRuntimeAppliesACompleteValidRetainedSnapshotAndReportsItsRevision(scope);

  registerWagoRuntimePublishesTheRequiredRetainedDiscoveryAnnouncementAndPersistsAValidClaim(scope);

  registerWagoRuntimePreservesPersistedRuntimeStateWhenReceivingADiscoveryClaimBeforeStartup(scope);

  registerWagoRuntimeIncludesThePairingCodeInTheBackendCompatibleHeartbeat(scope);

  registerWagoRuntimeReportsItsLaunchImageIdentityThroughANonRetainedPermanentHeartbeat(scope);

  registerWagoRuntimeActivatesDisconnectHandlingBeforeAStalledInitialCanonicalHeartbeat(scope);

  registerWagoRuntimeRetriesInterruptedStartupWithoutReloadingStateOrDuplicatingEstablishedSubscriptions(scope);

  registerWagoRuntimeStartsWhenReservingInitialStateTelemetryFails(scope);

  registerWagoRuntimeAcceptsOpaqueServerDefinedProfileNames(scope);
  registerWagoRuntimeRejectsAnInvalidSnapshotWithoutReplacingTheLastValidConfiguration(scope);

  registerWagoRuntimeReportsMalformedSnapshotCapabilitiesInsteadOfThrowing(scope);

  registerWagoRuntimeRejectsMalformedChannelDefinitionsBeforeTheyCanReachDeviceControl(scope);

  registerWagoRuntimeRejectsInvalidMeasurementMetadataJ(scope);

  registerWagoRuntimeRejectsDuplicateLogicalChannelIds(scope);

  registerWagoRuntimeEvaluatesGuardsAgainstTheirPhysicalInput(scope);

  registerWagoRuntimeReservesConcurrentCommandIdsBeforeDeviceWrites(scope);

  registerWagoRuntimeRejectsExpiredCommandsBeforeWritingTheDevice(scope);

  registerWagoRuntimeRejectsCommandsWithoutExpiryOrAConfigurationRevisionBeforeWritingTheDevice(scope);

  registerWagoRuntimeRejectsPulsesOnSwitchedOutputsBeforeAnyDeviceWriteOrCommandReservation(scope);

  registerWagoRuntimeRejectsStaleConfigurationRevisionsBeforeWritingTheDevice(scope);

  registerWagoRuntimeDoesNotRepeatAnUnexpiredPulseAfterARuntimeReboot(scope);

  registerWagoRuntimeAllowsACommandIdToBeReusedAfterItsPersistedExpiry(scope);

  registerWagoRuntimeAllowsACommandToBeRetriedAfterAFailedDeviceWrite(scope);

  registerWagoRuntimeDeactivatesAPulseWhenRetainedStatePublicationFailsAfterItTurnsOn(scope);

  registerWagoRuntimeRetriesAFailedScheduledPulseShutdown(scope);

  registerWagoRuntimeKeepsActivePulsesUntilTheirDeadlineAfterApplyingAReplacementConfiguration(scope);

  registerWagoRuntimeAppliesConfigurationWhileAScheduledPulseShutdownKeepsRetrying(scope);

  registerWagoRuntimeShutsDownAPulseThatCompletesWhileConfigurationReplacementIsWaiting(scope);

  registerWagoRuntimeSerializesDesiredConfigurationReplacementsInArrivalOrder(scope);

  registerWagoRuntimeRejectsSetSWithoutCancellingAPendingPulseShutdown(scope);

  registerWagoRuntimeSerializesCommandsForOneChannelInArrivalOrder(scope);

  registerWagoRuntimeReportsConfiguredFeedbackMismatchesAfterOutputWrites(scope);

  registerWagoRuntimeStartsFeedbackVerificationBeforeRetainedStatePublicationCompletes(scope);

  registerWagoRuntimeRejectsACommandThatWaitsBehindAWriteWhenItsConfigurationChanges(scope);

  registerWagoRuntimeDoesNotAcknowledgeAPulseWhenPersistingItsOutputStateFails(scope);

  registerWagoRuntimeKeepsThePreviousConfigurationActiveWhenPersistingAReplacementFails(scope);

  registerWagoRuntimePersistsACommandReservationBeforeActuatingTheDevice(scope);

  registerWagoRuntimeAcknowledgesDuplicateCommandsAndEnforcesImmediateDisconnectPolicy(scope);

  registerWagoRuntimeDoesNotPostponeAWatchdogShutdownForRepeatedDisconnectNotifications(scope);

  registerWagoRuntimeCancelsAPendingWatchdogShutdownWhenReconnecting(scope);

  registerWagoRuntimeRetriesTheAggregateImmediateShutdownStateAfterAStateStoreFailure(scope);

  registerWagoRuntimePersistsOutputAndConnectionStateChanges(scope);

  registerWagoRuntimeRejectsNumericDigitalReadbackInsteadOfPublishingAFalseBoolean(scope);

  registerWagoRuntimeExcludesFeedbackForOutputsRemovedFromTheActiveConfiguration(scope);

  registerWagoRuntimeSerializesConcurrentStateSaves(scope);
  registerWagoRuntimePublishesTypedIntegerBaseUnitMeasurementsWithStreamIdentity(scope);

  registerWagoRuntimeRoundsScaledFloatMeasurementsWithinFloatingPointPrecision(scope);

  registerWagoRuntimeRejectsLargeFractionalMeasurements(scope);

  registerWagoRuntimeUsesANewMeasurementStreamIdentityAfterARuntimeRestart(scope);

  registerWagoRuntimeShutsOffAnAcceptedPulseAfterANewerPulseFails(scope);

  registerWagoRuntimeShutsOffADelayedPulseAfterANewerPulseSucceeds(scope);

  registerWagoRuntimeDoesNotLetAStalePulseShutoffOverrideASetCommandAfterChangingToSwitchedBehavior(scope);

  registerWagoRuntimeReportsAFeedbackMismatchAfterTheConfiguredFeedbackTimeout(scope);

  registerWagoRuntimeVerifiesFinalOffFeedbackSWhilePulseShutdownPersistenceIsPending(scope);

  registerWagoRuntimeCancelsFeedbackChecksSupersededByALaterOutputCommand(scope);

  registerWagoRuntimeKeepsThePriorFeedbackCheckWhenAReplacementWriteFails(scope);

  registerWagoRuntimeKeepsFeedbackVerificationForASuccessfulWriteQueuedBeforeAFailedReplacement(scope);

  registerWagoRuntimeDoesNotPublishAMismatchFromASupersededInFlightFeedbackCheck(scope);

  registerWagoRuntimeDoesNotPublishAFaultFromAnInFlightFeedbackCheckAfterReplacingConfiguration(scope);

  registerWagoRuntimeCancelsFeedbackFromAWriteCompletedWhileConfigurationReplacementWaits(scope);

  registerWagoRuntimeRejectsCommandsBeyondThePerChannelWriteQueueLimit(scope);

  registerWagoRuntimeRejectsFeedbackThatReferencesTheOutputRatherThanAnInputChannel(scope);
  registerWagoRuntimeReservesOperationalMessageSequencesWithoutSavingForEveryMeasurement(scope);
  registerWagoRuntimePublishesCanonicalMeasurementsInABootStream(scope);
  registerWagoRuntimeDoesNotPublishFromASequenceRangeWhoseReservationFailedToSave(scope);
  registerWagoRuntimeDoesNotLetAConcurrentStateSaveOverwriteASequenceReservation(scope);

  return scope;
}
