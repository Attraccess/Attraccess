import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './wago-controller.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoService } from './wago.service';
import { registerListsAnOfflineControllerAsStaleAfterRestartingRuntimeMonitoring } from './wago.service.lists-a-connected-mismatched-runtime-in-a-dedicated-update-status-and-publishes-a-connection-bound-p.test-cases';
import { registerSubscribesAMigratedControllerDirectlyWithoutContactingItsUnreachablePreviousBroker } from './wago.service.routes-configuration-reports-through-independent-bounded-controller-queues.test-cases';
import { registerChecksSoftwareAfterRestartingRuntimeMonitoringUntilTheRunningImageIsConfirmed } from './wago.service.accepts-a-heartbeat-that-omits-the-optional-sequence.test-cases';
import { registerRestoresMigratedControllerSubscriptionsAfterApiRestartWhileThePreviousDefaultBrokerIsUn } from './wago.service.restores-migrated-controller-subscriptions-after-api-restart-while-the-previous-default-broker-is-un.test-cases';
import { registerKeepsTheMigratedBrokerActiveWhenAnOverlappingRebuildCapturedItsPreviousAssociation } from './wago.service.ignores-null-acknowledgements-and-rejects-while-publication-is-stalled.test-cases';
import { registerListsAConnectedMismatchedRuntimeInADedicatedUpdateStatusAndPublishesAConnectionBoundP } from './wago.service.lists-a-connected-mismatched-runtime-in-a-dedicated-update-status-and-publishes-a-connection-bound-p.test-cases';
import { registerRetriesRuntimePolicyAfterPublicationSFailsWithoutUnblockingCommands } from './wago.service.restores-migrated-controller-subscriptions-after-api-restart-while-the-previous-default-broker-is-un.test-cases';
import { registerReplaysOnlyPublishedConfigurationWhenTheLatestRevisionIsS } from './wago.service.publishes-a-configured-command-without-waiting-when-dispatch-completion-is-selected.test-cases';
import { registerRevokesAClaimedControllerBeforeDeletingItsLocalRecords } from './wago.service.restores-migrated-controller-subscriptions-after-api-restart-while-the-previous-default-broker-is-un.test-cases';
import { registerDoesNotExposePhysicalVerificationSecretsInControllerListings } from './wago.service.does-not-block-unrelated-claims-while-delivering-credentials.test-cases';
import { registerRetriesMqttSubscriptionsInsteadOfFailingModuleStartup } from './wago.service.restores-migrated-controller-subscriptions-after-api-restart-while-the-previous-default-broker-is-un.test-cases';
import { registerPublishesAConfiguredCommandWithoutWaitingWhenDispatchCompletionIsSelected } from './wago.service.publishes-a-configured-command-without-waiting-when-dispatch-completion-is-selected.test-cases';
import { registerRejectsInvalidPersistedCommandPolicies } from './wago.service.publishes-a-configured-command-without-waiting-when-dispatch-completion-is-selected.test-cases';
import { registerRejectsAcknowledgementTimeoutsThatExceedTheSupportedMaximum } from './wago.service.publishes-a-configured-command-without-waiting-when-dispatch-completion-is-selected.test-cases';
import { registerBindsNumericControllerIdsWhenLookingUpChannelReferences } from './wago.service.accepts-a-heartbeat-that-omits-the-optional-sequence.test-cases';
import { registerConsumesAPendingAcknowledgementRejectionWhenCommandPublicationFails } from './wago.service.accepts-a-heartbeat-that-omits-the-optional-sequence.test-cases';
import { registerPropagatesAControllerAcknowledgementRejectionMessage } from './wago.service.lists-a-connected-mismatched-runtime-in-a-dedicated-update-status-and-publishes-a-connection-bound-p.test-cases';
import { registerIgnoresNullAcknowledgementsAndRejectsWhilePublicationIsStalled } from './wago.service.ignores-null-acknowledgements-and-rejects-while-publication-is-stalled.test-cases';
import { registerCreatesDefaultSettingsWhenNoneHaveBeenPersisted } from './wago.service.accepts-a-heartbeat-that-omits-the-optional-sequence.test-cases';
import { registerDoesNotOverwriteADefaultMqttServerConfiguredWhileSettingsAreInitialized } from './wago.service.does-not-block-unrelated-claims-while-delivering-credentials.test-cases';
import { registerKeepsTheHostRunningWhenInitialWagoMqttSubscriptionsFail } from './wago.service.ignores-null-acknowledgements-and-rejects-while-publication-is-stalled.test-cases';
import { registerFailsStartupWhenWagoSubscriptionConfigurationCannotBeRead } from './wago.service.does-not-block-unrelated-claims-while-delivering-credentials.test-cases';
import { registerPreservesTheMqttServerDuringAPrefixOnlySettingsUpdate } from './wago.service.lists-a-connected-mismatched-runtime-in-a-dedicated-update-status-and-publishes-a-connection-bound-p.test-cases';
import { registerAcceptsAHeartbeatThatOmitsTheOptionalSequence } from './wago.service.accepts-a-heartbeat-that-omits-the-optional-sequence.test-cases';
import { registerDoesNotOverwriteNewlyCommittedBrokerOrCredentialBindingsWithAnInFlightOldHeartbeat } from './wago.service.does-not-block-unrelated-claims-while-delivering-credentials.test-cases';
import { registerPersistsAValidCanonicalHeartbeatWhenTheBoundedDiagnosticsCacheIsFull } from './wago.service.lists-a-connected-mismatched-runtime-in-a-dedicated-update-status-and-publishes-a-connection-bound-p.test-cases';
import { registerDoesNotRegressAPersistedHeartbeatWithAnOlderCanonicalHeartbeatWhenTheDiagnosticsCache } from './wago.service.does-not-block-unrelated-claims-while-delivering-credentials.test-cases';
import { registerPublishesARetainedContentAddressedRevisionOnlyAfterValidation } from './wago.service.publishes-a-configured-command-without-waiting-when-dispatch-completion-is-selected.test-cases';
import { registerRejectsPublicationForAClaimedRuntimeWithoutTheConfigurationContract } from './wago.service.publishes-a-configured-command-without-waiting-when-dispatch-completion-is-selected.test-cases';
import { registerDeliversTheControllerScopedConfigurationNamespaceWithClaimCredentials } from './wago.service.accepts-a-heartbeat-that-omits-the-optional-sequence.test-cases';
import { registerRevokesBootstrapCredentialsOnlyAfterTheControllerAcknowledgesDurableClaimStorage } from './wago.service.restores-migrated-controller-subscriptions-after-api-restart-while-the-previous-default-broker-is-un.test-cases';
import { registerRecordsStructuredControllerRejectionWithoutChangingThePublishedSnapshot } from './wago.service.publishes-a-configured-command-without-waiting-when-dispatch-completion-is-selected.test-cases';
import { registerIgnoresReportsForATerminalSRevisionState } from './wago.service.ignores-null-acknowledgements-and-rejects-while-publication-is-stalled.test-cases';
import { registerIgnoresControllerRejectionsWithoutFieldLevelErrorDetails } from './wago.service.does-not-block-unrelated-claims-while-delivering-credentials.test-cases';
import { registerSerializesConfigurationReportsWithPublicationForTheSameController } from './wago.service.routes-configuration-reports-through-independent-bounded-controller-queues.test-cases';
import { registerRoutesConfigurationReportsThroughIndependentBoundedControllerQueues } from './wago.service.routes-configuration-reports-through-independent-bounded-controller-queues.test-cases';
import { registerRetainsQueuedReportsForEachRevisionOfABusyController } from './wago.service.restores-migrated-controller-subscriptions-after-api-restart-while-the-previous-default-broker-is-un.test-cases';
import { registerBoundsQueuedReportsForABusyControllerWhileRetainingReplacements } from './wago.service.accepts-a-heartbeat-that-omits-the-optional-sequence.test-cases';
import { registerReturnsBoundedRevisionMetadataPagesWithoutSnapshots } from './wago.service.restores-migrated-controller-subscriptions-after-api-restart-while-the-previous-default-broker-is-un.test-cases';
import { registerSerializesConcurrentClaimsForTheSameController } from './wago.service.routes-configuration-reports-through-independent-bounded-controller-queues.test-cases';
import { registerDoesNotBlockUnrelatedClaimsWhileDeliveringCredentials } from './wago.service.does-not-block-unrelated-claims-while-delivering-credentials.test-cases';
import { registerKeepsAManuallyRevocableEnrollmentActive } from './wago.service.ignores-null-acknowledgements-and-rejects-while-publication-is-stalled.test-cases';
import { registerRevokesAnExpiredEnrollmentCredentialBeforeCommissioningDeletesItsRecord } from './wago.service.revokes-an-expired-enrollment-credential-before-commissioning-deletes-its-record.test-cases';
import { registerReturnsAdministratorSuppliedManualCredentialsWhenAutomaticProvisioningIsUnavailable } from './wago.service.restores-migrated-controller-subscriptions-after-api-restart-while-the-previous-default-broker-is-un.test-cases';
import { registerDiscardsAManualEnrollmentRecoveryRecordWhenCredentialsAreNotSupplied } from './wago.service.accepts-a-heartbeat-that-omits-the-optional-sequence.test-cases';
import { registerPersistsAnEnrollmentRecoveryRecordBeforeProvisioningTheBrokerCredential } from './wago.service.lists-a-connected-mismatched-runtime-in-a-dedicated-update-status-and-publishes-a-connection-bound-p.test-cases';
import { registerLeavesBootstrapCredentialsAvailableUntilExpiryAfterAPostDeliveryClaimFailure } from './wago.service.ignores-null-acknowledgements-and-rejects-while-publication-is-stalled.test-cases';
import { registerPreservesTheClaimFailureWhenRestoringTheControllerStateFails } from './wago.service.lists-a-connected-mismatched-runtime-in-a-dedicated-update-status-and-publishes-a-connection-bound-p.test-cases';
import { registerReleasesTheClaimConfigurationLockAfterPreparationFails } from './wago.service.publishes-a-configured-command-without-waiting-when-dispatch-completion-is-selected.test-cases';
import { registerDoesNotTreatRevokedEnrollmentsAsActive } from './wago.service.does-not-block-unrelated-claims-while-delivering-credentials.test-cases';
import { registerKeepsReplacementSubscriptionsInertUntilTheyReplaceTheActiveGeneration } from './wago.service.ignores-null-acknowledgements-and-rejects-while-publication-is-stalled.test-cases';
import { registerPreservesRetainedStateDeliveredBeforeReplacementSubscriptionsActivate } from './wago.service.lists-a-connected-mismatched-runtime-in-a-dedicated-update-status-and-publishes-a-connection-bound-p.test-cases';
import { registerUnsubscribesAnInFlightReplacementWhenTheModuleIsDestroyed } from './wago.service.routes-configuration-reports-through-independent-bounded-controller-queues.test-cases';
import { registerRetainsRevocationProgressWhenRecordingConsumptionFails } from './wago.service.restores-migrated-controller-subscriptions-after-api-restart-while-the-previous-default-broker-is-un.test-cases';
import { registerDoesNotRevokeCredentialsAgainAfterRevocationWasRecorded } from './wago.service.does-not-block-unrelated-claims-while-delivering-credentials.test-cases';
import { registerStartsTheEditorFromTheLastAppliedRevisionWithoutCreatingADraft } from './wago.service.routes-configuration-reports-through-independent-bounded-controller-queues.test-cases';
import { registerRejectsStaleEditorSavesInsideTheConfigurationLockIncludingMetadataOnlyChanges } from './wago.service.publishes-a-configured-command-without-waiting-when-dispatch-completion-is-selected.test-cases';
import { controller, createWagoServiceFixture } from './wago-service.test-fixture';

describe('WagoService', () => {
  defineWagoServiceTests();
});

export function defineWagoServiceTests() {
  const services: WagoService[] = [];
  afterEach(() => {
    services.splice(0).forEach((service) => service.onModuleDestroy());
  });

  function createService(
    controllers = [controller()],
    enrollments: WagoEnrollment[] = [],
    defaultMqttServerId: number | null = null,
  ) {
    return createWagoServiceFixture(services, controllers, enrollments, defaultMqttServerId);
  }
  const scope = {
    get controller() {
      return controller;
    },
    get createService() {
      return createService;
    },
  };

  registerListsAnOfflineControllerAsStaleAfterRestartingRuntimeMonitoring(scope);

  registerSubscribesAMigratedControllerDirectlyWithoutContactingItsUnreachablePreviousBroker(scope);

  registerChecksSoftwareAfterRestartingRuntimeMonitoringUntilTheRunningImageIsConfirmed(scope);

  registerRestoresMigratedControllerSubscriptionsAfterApiRestartWhileThePreviousDefaultBrokerIsUn(scope);

  registerKeepsTheMigratedBrokerActiveWhenAnOverlappingRebuildCapturedItsPreviousAssociation(scope);

  registerListsAConnectedMismatchedRuntimeInADedicatedUpdateStatusAndPublishesAConnectionBoundP(scope);

  registerRetriesRuntimePolicyAfterPublicationSFailsWithoutUnblockingCommands(scope);

  registerReplaysOnlyPublishedConfigurationWhenTheLatestRevisionIsS(scope);

  registerRevokesAClaimedControllerBeforeDeletingItsLocalRecords(scope);

  registerDoesNotExposePhysicalVerificationSecretsInControllerListings(scope);

  it('resolves repositories only after the host module initializes', async () => {
    const context = { getRepository: jest.fn() } as unknown as PluginContext;
    new WagoService(context);

    expect(context.getRepository).not.toHaveBeenCalled();
  });

  registerRetriesMqttSubscriptionsInsteadOfFailingModuleStartup(scope);

  registerPublishesAConfiguredCommandWithoutWaitingWhenDispatchCompletionIsSelected(scope);

  registerRejectsInvalidPersistedCommandPolicies(scope);

  registerRejectsAcknowledgementTimeoutsThatExceedTheSupportedMaximum(scope);

  registerBindsNumericControllerIdsWhenLookingUpChannelReferences(scope);

  registerConsumesAPendingAcknowledgementRejectionWhenCommandPublicationFails(scope);

  registerPropagatesAControllerAcknowledgementRejectionMessage(scope);

  registerIgnoresNullAcknowledgementsAndRejectsWhilePublicationIsStalled(scope);

  registerCreatesDefaultSettingsWhenNoneHaveBeenPersisted(scope);

  registerDoesNotOverwriteADefaultMqttServerConfiguredWhileSettingsAreInitialized(scope);

  registerKeepsTheHostRunningWhenInitialWagoMqttSubscriptionsFail(scope);

  registerFailsStartupWhenWagoSubscriptionConfigurationCannotBeRead(scope);
  registerPreservesTheMqttServerDuringAPrefixOnlySettingsUpdate(scope);

  it('requires a non-empty matching fingerprint', () => {
    const { service } = createService();
    const matchesVerifier = Reflect.get(service, 'matchesVerifier') as (item: WagoController, value: string) => boolean;

    expect(matchesVerifier(controller(), '')).toBe(false);
  });

  registerAcceptsAHeartbeatThatOmitsTheOptionalSequence(scope);

  registerDoesNotOverwriteNewlyCommittedBrokerOrCredentialBindingsWithAnInFlightOldHeartbeat(scope);

  registerPersistsAValidCanonicalHeartbeatWhenTheBoundedDiagnosticsCacheIsFull(scope);

  registerDoesNotRegressAPersistedHeartbeatWithAnOlderCanonicalHeartbeatWhenTheDiagnosticsCache(scope);

  registerPublishesARetainedContentAddressedRevisionOnlyAfterValidation(scope);

  registerRejectsPublicationForAClaimedRuntimeWithoutTheConfigurationContract(scope);

  registerDeliversTheControllerScopedConfigurationNamespaceWithClaimCredentials(scope);

  registerRevokesBootstrapCredentialsOnlyAfterTheControllerAcknowledgesDurableClaimStorage(scope);

  registerRecordsStructuredControllerRejectionWithoutChangingThePublishedSnapshot(scope);

  registerIgnoresReportsForATerminalSRevisionState(scope);

  registerIgnoresControllerRejectionsWithoutFieldLevelErrorDetails(scope);

  registerSerializesConfigurationReportsWithPublicationForTheSameController(scope);

  registerRoutesConfigurationReportsThroughIndependentBoundedControllerQueues(scope);

  registerRetainsQueuedReportsForEachRevisionOfABusyController(scope);

  registerBoundsQueuedReportsForABusyControllerWhileRetainingReplacements(scope);

  registerReturnsBoundedRevisionMetadataPagesWithoutSnapshots(scope);

  registerSerializesConcurrentClaimsForTheSameController(scope);

  registerDoesNotBlockUnrelatedClaimsWhileDeliveringCredentials(scope);

  registerKeepsAManuallyRevocableEnrollmentActive(scope);

  registerRevokesAnExpiredEnrollmentCredentialBeforeCommissioningDeletesItsRecord(scope);

  registerReturnsAdministratorSuppliedManualCredentialsWhenAutomaticProvisioningIsUnavailable(scope);

  registerDiscardsAManualEnrollmentRecoveryRecordWhenCredentialsAreNotSupplied(scope);

  it.each(['cc100/+1', 'cc100/#1'])('rejects MQTT wildcard characters in hardware IDs', async (hardwareId) => {
    const { service } = createService();

    await expect(service.createEnrollment(hardwareId)).rejects.toThrow('without MQTT separators or wildcards');
  });

  registerPersistsAnEnrollmentRecoveryRecordBeforeProvisioningTheBrokerCredential(scope);

  registerLeavesBootstrapCredentialsAvailableUntilExpiryAfterAPostDeliveryClaimFailure(scope);

  registerPreservesTheClaimFailureWhenRestoringTheControllerStateFails(scope);

  registerReleasesTheClaimConfigurationLockAfterPreparationFails(scope);

  registerDoesNotTreatRevokedEnrollmentsAsActive(scope);

  registerKeepsReplacementSubscriptionsInertUntilTheyReplaceTheActiveGeneration(scope);

  registerPreservesRetainedStateDeliveredBeforeReplacementSubscriptionsActivate(scope);

  registerUnsubscribesAnInFlightReplacementWhenTheModuleIsDestroyed(scope);

  registerRetainsRevocationProgressWhenRecordingConsumptionFails(scope);

  registerDoesNotRevokeCredentialsAgainAfterRevocationWasRecorded(scope);
  registerStartsTheEditorFromTheLastAppliedRevisionWithoutCreatingADraft(scope);

  registerRejectsStaleEditorSavesInsideTheConfigurationLockIncludingMetadataOnlyChanges(scope);

  return scope;
}

export type WagoServiceTestScope = ReturnType<typeof defineWagoServiceTests>;
