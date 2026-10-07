import { screen } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, expect, it } from 'vitest';
import type { CommissioningSession, CommissioningVerification } from './api';
import { mount } from './CommissioningModal.test.mount';
export { mount } from './CommissioningModal.test.mount';
import { registerUsesTheDefaultRootLoginForCleanupWithoutAnotherCredentialPrompt } from './CommissioningModal.suppresses-stale-saved-activation-while-retaining-pending-recovery-s.test-cases';
import { registerOffersPreparationCleanupAloneWithoutRuntimeRecoveryOwnershipS } from './CommissioningModal.offers-manual-recovery-in-s-without-starting-it.test-cases';
import { registerRoutesCleanupThroughTheRuntimeWhenBothInstallationAndPreparationRecordsExist } from './CommissioningModal.offers-manual-recovery-in-s-without-starting-it.test-cases';
import { registerExposesGuardedRecordDeletionForRevokedCommissioningHistory } from './CommissioningModal.clears-recovery-credentials-and-consent-on-s-close-change.test-cases';
import { registerOpensTheExistingVisualConfigurationWorkflowWithoutClaimingHardwareQualification } from './CommissioningModal.offers-manual-recovery-in-s-without-starting-it.test-cases';
import { registerOffersManualRecoveryInSWithoutStartingIt } from './CommissioningModal.offers-manual-recovery-in-s-without-starting-it.test-cases';
import { registerUsesASingleCleanupActionScrubsCredentialsAndNeverRetriesFailureS } from './CommissioningModal.suppresses-stale-saved-activation-while-retaining-pending-recovery-s.test-cases';
import { registerClearsRecoveryCredentialsAndConsentOnSCloseChange } from './CommissioningModal.clears-recovery-credentials-and-consent-on-s-close-change.test-cases';
import { registerTargetsTheNewlyOpenedSessionAfterAnEarlierRecovery } from './CommissioningModal.suppresses-stale-saved-activation-while-retaining-pending-recovery-s.test-cases';
import { registerSwitchesTheSavedPreparationStatusWithoutAnotherRequestS } from './CommissioningModal.suppresses-stale-saved-activation-while-retaining-pending-recovery-s.test-cases';
import { registerShowsSavedUtcSkewActionAndResultWithoutClaimingLiveSynchronization } from './CommissioningModal.offers-manual-recovery-in-s-without-starting-it.test-cases';
import { registerSuppressesStaleSavedActivationWhileRetainingPendingRecoveryS } from './CommissioningModal.suppresses-stale-saved-activation-while-retaining-pending-recovery-s.test-cases';
import { registerExplainsMandatoryPlcDisablementAndReportsUnsupportedDockerDependencies } from './CommissioningModal.clears-recovery-credentials-and-consent-on-s-close-change.test-cases';
import { registerDoesNotOfferActivationForAnUnsupportedFirmwareReportEvenWhenAnInstalledRuntimeIsStopp } from './CommissioningModal.clears-recovery-credentials-and-consent-on-s-close-change.test-cases';
import { registerDistinguishesSavedSInspectionFromVerifiedPreparationAfterALaterFailure } from './CommissioningModal.clears-recovery-credentials-and-consent-on-s-close-change.test-cases';
import { registerRetainsTheActiveCodesysWarningWhenDisablingFailed } from './CommissioningModal.offers-manual-recovery-in-s-without-starting-it.test-cases';
import { registerUsesFactorySshAccessWithoutAskingForAPasswordInTheNormalPath } from './CommissioningModal.suppresses-stale-saved-activation-while-retaining-pending-recovery-s.test-cases';
import { registerUsesTheInstallButtonAsTheConsequenceConfirmationForSWithoutPreservationOrWbmGates } from './CommissioningModal.suppresses-stale-saved-activation-while-retaining-pending-recovery-s.test-cases';
import { registerSubmitsOnceAndClearsSecretsAfterSubmissionFailureS } from './CommissioningModal.offers-manual-recovery-in-s-without-starting-it.test-cases';
import { registerClearsThePasswordWhenClosedExternallyAndReopened } from './CommissioningModal.clears-recovery-credentials-and-consent-on-s-close-change.test-cases';
import { registerClearsThePasswordOnTheCloseButton } from './CommissioningModal.clears-recovery-credentials-and-consent-on-s-close-change.test-cases';
import { registerKeepsAFreshlyResumedSessionInsteadOfRegressingToAnOlderCachedResponse } from './CommissioningModal.clears-recovery-credentials-and-consent-on-s-close-change.test-cases';
import { registerExplainsLostAuthenticationWithoutLosingTheLastKnownControllerProgress } from './CommissioningModal.clears-recovery-credentials-and-consent-on-s-close-change.test-cases';
import { registerShowsWhenTheControllerLastUpdatedAndTheRemainingOperationTime } from './CommissioningModal.offers-manual-recovery-in-s-without-starting-it.test-cases';
import { registerShowsTheLastControllerCheckpointOnTheFailureScreen } from './CommissioningModal.offers-manual-recovery-in-s-without-starting-it.test-cases';
import { registerCollectsOnlyNameAndIpWhenOneBrokerIsAvailableSelectsRuntimeAutomaticallyAndSupportsFo } from './CommissioningModal.clears-recovery-credentials-and-consent-on-s-close-change.test-cases';
import { registerShowsASpecificFailureAndOnlyCleanupWhenAnInstallationNeedsRecovery } from './CommissioningModal.offers-manual-recovery-in-s-without-starting-it.test-cases';
import { registerShowsVerifiedEnrollmentSeparatelyFromUnfinishedConfigurationAndManagement } from './CommissioningModal.offers-manual-recovery-in-s-without-starting-it.test-cases';
import { registerSwitchesVerificationAndCompletedSummaryStatusesWithTheHostLanguageCompleteS } from './CommissioningModal.suppresses-stale-saved-activation-while-retaining-pending-recovery-s.test-cases';
import { registerKeepsEnrollmentPendingWhenSHasNotBeenVerified } from './CommissioningModal.clears-recovery-credentials-and-consent-on-s-close-change.test-cases';
import { registerRequiresReviewedIdentityBeforeConfirmingAHostKeyIsolatedS } from './CommissioningModal.offers-manual-recovery-in-s-without-starting-it.test-cases';
import { registerLetsTheOperatorKeepEnrollmentAfterOpeningCancellationWithoutSendingARevocation } from './CommissioningModal.clears-recovery-credentials-and-consent-on-s-close-change.test-cases';
import { registerSwitchesSavedCommissioningFailuresWithoutNewRequestsS } from './CommissioningModal.suppresses-stale-saved-activation-while-retaining-pending-recovery-s.test-cases';
import { session } from './CommissioningModal.state';
import { fillRecoveryCredentials } from './CommissioningModal.test.fixtures';
import { fillCredentials } from './CommissioningModal.test.fixtures';

export let client: QueryClient;

export let requests: Array<{ url: string; body: string | undefined }>;

export let failInstall: boolean;

export let failRecovery: boolean;

export let activeSession: CommissioningSession;

export let verificationControllerId: number | null;

export let verificationOverrides: Partial<CommissioningVerification>;

export function defineExplicitRecoveryActionTests() {
  beforeEach(() => {
    activeSession.runtimeRecoveryAvailable = true;
  });
  const scope = {
    get activeSession() {
      return activeSession;
    },
    set activeSession(value: typeof activeSession) {
      activeSession = value;
    },
    mount,
    get requests() {
      return requests;
    },
    set requests(value: typeof requests) {
      requests = value;
    },
    get verificationControllerId() {
      return verificationControllerId;
    },
    set verificationControllerId(value: typeof verificationControllerId) {
      verificationControllerId = value;
    },
    get client() {
      return client;
    },
    set client(value: typeof client) {
      client = value;
    },
    get failRecovery() {
      return failRecovery;
    },
    set failRecovery(value: typeof failRecovery) {
      failRecovery = value;
    },
    fillRecoveryCredentials,
  };

  registerUsesTheDefaultRootLoginForCleanupWithoutAnotherCredentialPrompt(scope);
  registerOffersPreparationCleanupAloneWithoutRuntimeRecoveryOwnershipS(scope);
  registerRoutesCleanupThroughTheRuntimeWhenBothInstallationAndPreparationRecordsExist(scope);
  registerExposesGuardedRecordDeletionForRevokedCommissioningHistory(scope);
  registerOpensTheExistingVisualConfigurationWorkflowWithoutClaimingHardwareQualification(scope);
  registerOffersManualRecoveryInSWithoutStartingIt(scope);
  registerUsesASingleCleanupActionScrubsCredentialsAndNeverRetriesFailureS(scope);
  registerClearsRecoveryCredentialsAndConsentOnSCloseChange(scope);
  registerTargetsTheNewlyOpenedSessionAfterAnEarlierRecovery(scope);

  return scope;
}

export function defineFw31SoftwareSupportBoundaryTests() {
  const scope = {
    get activeSession() {
      return activeSession;
    },
    set activeSession(value: typeof activeSession) {
      activeSession = value;
    },
    mount,
    get requests() {
      return requests;
    },
    set requests(value: typeof requests) {
      requests = value;
    },
  };
  registerSwitchesTheSavedPreparationStatusWithoutAnotherRequestS(scope);
  registerShowsSavedUtcSkewActionAndResultWithoutClaimingLiveSynchronization(scope);
  registerSuppressesStaleSavedActivationWhileRetainingPendingRecoveryS(scope);
  registerExplainsMandatoryPlcDisablementAndReportsUnsupportedDockerDependencies(scope);
  registerDoesNotOfferActivationForAnUnsupportedFirmwareReportEvenWhenAnInstalledRuntimeIsStopp(scope);
  registerDistinguishesSavedSInspectionFromVerifiedPreparationAfterALaterFailure(scope);
  registerRetainsTheActiveCodesysWarningWhenDisablingFailed(scope);

  return scope;
}

export function defineExplicitInstallActionTests() {
  it('does not query coordinator recovery or show an interrupted-operation gate', () => {
    mount();
    expect(requests.some(({ url }) => url.endsWith('/operation'))).toBe(false);
    expect(screen.queryByText('Interrupted coordinator recovery required')).toBeNull();
  });
  const scope = {
    mount,
    get requests() {
      return requests;
    },
    set requests(value: typeof requests) {
      requests = value;
    },
    get activeSession() {
      return activeSession;
    },
    set activeSession(value: typeof activeSession) {
      activeSession = value;
    },
    fillCredentials,
    get failInstall() {
      return failInstall;
    },
    set failInstall(value: typeof failInstall) {
      failInstall = value;
    },
    get client() {
      return client;
    },
    set client(value: typeof client) {
      client = value;
    },
  };
  registerUsesFactorySshAccessWithoutAskingForAPasswordInTheNormalPath(scope);
  registerUsesTheInstallButtonAsTheConsequenceConfirmationForSWithoutPreservationOrWbmGates(scope);
  registerSubmitsOnceAndClearsSecretsAfterSubmissionFailureS(scope);
  registerClearsThePasswordWhenClosedExternallyAndReopened(scope);
  registerClearsThePasswordOnTheCloseButton(scope);

  return scope;
}

export function defineRootTestRegistrationsTests() {
  const scope = {
    get session() {
      return session;
    },
    get client() {
      return client;
    },
    set client(value: typeof client) {
      client = value;
    },
    get activeSession() {
      return activeSession;
    },
    set activeSession(value: typeof activeSession) {
      activeSession = value;
    },
    mount,
    get requests() {
      return requests;
    },
    set requests(value: typeof requests) {
      requests = value;
    },
    get verificationControllerId() {
      return verificationControllerId;
    },
    set verificationControllerId(value: typeof verificationControllerId) {
      verificationControllerId = value;
    },
    get verificationOverrides() {
      return verificationOverrides;
    },
    set verificationOverrides(value: typeof verificationOverrides) {
      verificationOverrides = value;
    },
  };

  registerKeepsAFreshlyResumedSessionInsteadOfRegressingToAnOlderCachedResponse(scope);
  registerExplainsLostAuthenticationWithoutLosingTheLastKnownControllerProgress(scope);
  registerShowsWhenTheControllerLastUpdatedAndTheRemainingOperationTime(scope);
  registerShowsTheLastControllerCheckpointOnTheFailureScreen(scope);
  registerCollectsOnlyNameAndIpWhenOneBrokerIsAvailableSelectsRuntimeAutomaticallyAndSupportsFo(scope);
  registerShowsASpecificFailureAndOnlyCleanupWhenAnInstallationNeedsRecovery(scope);
  registerShowsVerifiedEnrollmentSeparatelyFromUnfinishedConfigurationAndManagement(scope);
  registerSwitchesVerificationAndCompletedSummaryStatusesWithTheHostLanguageCompleteS(scope);
  registerKeepsEnrollmentPendingWhenSHasNotBeenVerified(scope);
  registerRequiresReviewedIdentityBeforeConfirmingAHostKeyIsolatedS(scope);
  registerLetsTheOperatorKeepEnrollmentAfterOpeningCancellationWithoutSendingARevocation(scope);
  registerSwitchesSavedCommissioningFailuresWithoutNewRequestsS(scope);

  return scope;
}

export function getSetupScope() {
  return {
    get client() {
      return client;
    },
    set client(value: typeof client) {
      client = value;
    },
    get requests() {
      return requests;
    },
    set requests(value: typeof requests) {
      requests = value;
    },
    get failInstall() {
      return failInstall;
    },
    set failInstall(value: typeof failInstall) {
      failInstall = value;
    },
    get failRecovery() {
      return failRecovery;
    },
    set failRecovery(value: typeof failRecovery) {
      failRecovery = value;
    },
    get activeSession() {
      return activeSession;
    },
    set activeSession(value: typeof activeSession) {
      activeSession = value;
    },
    get session() {
      return session;
    },
    get verificationControllerId() {
      return verificationControllerId;
    },
    set verificationControllerId(value: typeof verificationControllerId) {
      verificationControllerId = value;
    },
    get verificationOverrides() {
      return verificationOverrides;
    },
    set verificationOverrides(value: typeof verificationOverrides) {
      verificationOverrides = value;
    },
  };
}
