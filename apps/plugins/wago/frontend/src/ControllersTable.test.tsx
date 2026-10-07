import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ControllersTable } from './ControllersTable';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import type { CommissioningSession, CommissioningVerification, WagoController } from './api';
import { registerHidesViewProgressOnceEnrollmentIsVerifiedKeepingConfigurationAndRuntimeInfoReachable } from './ControllersTable.can-transition-between-empty-and-populated-collections-without-changing-hook-order.test-cases';
import { registerExplainsTheDestructiveReEnrolmentRequiredForLegacyControllers } from './ControllersTable.can-transition-between-empty-and-populated-collections-without-changing-hook-order.test-cases';
import { registerDoesNotAskUsersToResumeCommissioningWhenVerifiedManagementFinishesAutomatically } from './ControllersTable.can-transition-between-empty-and-populated-collections-without-changing-hook-order.test-cases';
import { registerShowsTheSavedSshSetupFailureInTheDetailsDrawerInTheSelectedLanguage } from './ControllersTable.shows-the-actual-configuration-prerequisite-and-automatic-ssh-progress-without-a-continue-action.test-cases';
import { registerShowsTheActualConfigurationPrerequisiteAndAutomaticSshProgressWithoutAContinueAction } from './ControllersTable.shows-the-actual-configuration-prerequisite-and-automatic-ssh-progress-without-a-continue-action.test-cases';
import { registerShowsAutomaticUpdateProgressAndBeforeAfterVersionsInlineThroughCompletion } from './ControllersTable.keeps-session-recovery-reachable-when-merged-into-an-untrusted-controller-row.test-cases';
import { registerDistinguishesBuildsSharingAVersionAndShowsFailuresWithoutAnActiveProgressBar } from './ControllersTable.can-transition-between-empty-and-populated-collections-without-changing-hook-order.test-cases';
import { registerShowsAnUnderstandableFallbackForFutureUnknownUpdateFailures } from './ControllersTable.keeps-session-recovery-reachable-when-merged-into-an-untrusted-controller-row.test-cases';
import { registerTranslatesRuntimeRetriesAndRecoveryInPlaceWhenTheHostLanguageChanges } from './ControllersTable.shows-the-actual-configuration-prerequisite-and-automatic-ssh-progress-without-a-continue-action.test-cases';
import { registerShowsDurableUpdateFailureAndRequestsRecoverySecretsOnlyOnTheExplicitAuditedAction } from './ControllersTable.keeps-session-recovery-reachable-when-merged-into-an-untrusted-controller-row.test-cases';
import { registerDoesNotInferEnrollmentVerificationFromAnOnlineClaimedRow } from './ControllersTable.can-transition-between-empty-and-populated-collections-without-changing-hook-order.test-cases';
import { registerWithholdsTheRuntimeVerifiedLabelWhileAnEnrolledControllerRequiresAnUpdate } from './ControllersTable.shows-the-actual-configuration-prerequisite-and-automatic-ssh-progress-without-a-continue-action.test-cases';
import { registerShowsStartupSoftwareVerificationWithoutAnnouncingOrQueuingAnUpdate } from './ControllersTable.keeps-session-recovery-reachable-when-merged-into-an-untrusted-controller-row.test-cases';
import { registerKeepsAnOfflineControllerVisiblyNotRespondingWhileRuntimeVerificationIsPending } from './ControllersTable.can-transition-between-empty-and-populated-collections-without-changing-hook-order.test-cases';
import { registerKeepsAnOfflineUpdateFailureVisibleWithoutReplacingConnectivityWithThePendingImageMismat } from './ControllersTable.can-transition-between-empty-and-populated-collections-without-changing-hook-order.test-cases';
import { registerOffersARuntimeRetryForAManagedControllerInSWithoutRetryingEnrolment } from './ControllersTable.keeps-session-recovery-reachable-when-merged-into-an-untrusted-controller-row.test-cases';
import { registerOffersManagedAccessRetryForAnEnrolmentRequiringRecovery } from './ControllersTable.keeps-session-recovery-reachable-when-merged-into-an-untrusted-controller-row.test-cases';
import { registerKeepsAdministratorRecoveryAvailableForARemovedControllerSession } from './ControllersTable.can-transition-between-empty-and-populated-collections-without-changing-hook-order.test-cases';
import { registerDoesNotDisplayALateRecoverySecretResponseAfterTheRecoverySectionCloses } from './ControllersTable.can-transition-between-empty-and-populated-collections-without-changing-hook-order.test-cases';
import { registerWithdrawsCachedSuccessWhenVerificationPollingFails } from './ControllersTable.shows-the-actual-configuration-prerequisite-and-automatic-ssh-progress-without-a-continue-action.test-cases';
import { registerKeepsSessionRecoveryReachableWhenMergedIntoAnUntrustedControllerRow } from './ControllersTable.keeps-session-recovery-reachable-when-merged-into-an-untrusted-controller-row.test-cases';
import { registerCanTransitionBetweenEmptyAndPopulatedCollectionsWithoutChangingHookOrder } from './ControllersTable.can-transition-between-empty-and-populated-collections-without-changing-hook-order.test-cases';
import { registerKeepsDetailedFailuresAndAdministratorControlsOutOfTheCompactTable } from './ControllersTable.can-transition-between-empty-and-populated-collections-without-changing-hook-order.test-cases';
import { registerRendersAndPollsOnlyTheCurrentPageAndFindsDevicesByNameIdAndAddress } from './ControllersTable.keeps-session-recovery-reachable-when-merged-into-an-untrusted-controller-row.test-cases';
import { registerUsesNaturalGermanColumnAndRegistrationLabels } from './ControllersTable.shows-the-actual-configuration-prerequisite-and-automatic-ssh-progress-without-a-continue-action.test-cases';
import { registerDiscardsARecoveryPasswordResponseWhenTheDetailsDrawerCloses } from './ControllersTable.can-transition-between-empty-and-populated-collections-without-changing-hook-order.test-cases';
import { registerTranslatesRecognizedSavedFailuresOnMountedControllerRowsWhileRetainingUnknownText } from './ControllersTable.shows-the-actual-configuration-prerequisite-and-automatic-ssh-progress-without-a-continue-action.test-cases';

const getVerification = vi.hoisted(() => vi.fn());
const getUpdateStatus = vi.hoisted(() => vi.fn());
const getRootPassword = vi.hoisted(() => vi.fn());
const getSessionStatus = vi.hoisted(() => vi.fn());
const retryRuntimeUpdate = vi.hoisted(() => vi.fn());
const retryManagedAccess = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({
  getCommissioningVerification: getVerification,
  getRuntimeUpdateStatus: getUpdateStatus,
  getRootRecoveryPassword: getRootPassword,
  getManagedAccessStatus: getSessionStatus,
  retryManagedAccess,
  retryRuntimeUpdate,
  restoreManagedAccess: vi.fn(),
}));
let client: QueryClient;
const session = { id: 7, hardwareId: 'fixture', state: 'awaiting_verification' } as CommissioningSession;
const controller = {
  id: 1,
  hardwareId: 'fixture',
  name: 'Fixture',
  trustState: 'claimed',
  connectivity: 'online',
  runtimeVersion: '0.1.0',
} as WagoController;
const verified: CommissioningVerification = {
  controllerId: 1,
  permanentConnection: true,
  enrollmentRevoked: true,
  configurationApplied: true,
  hardwareReadiness: 'ready',
  managementHardening: 'unverified',
  softwareReady: false,
  physicalQualification: 'required',
  ready: false,
};
beforeEach(() => {
  useTranslationState.setState({ language: 'en' });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  getVerification.mockResolvedValue(verified);
  getUpdateStatus.mockResolvedValue({
    management: 'reenrol_required',
    sessionId: null,
    update: null,
    physicalQualification: 'unverified',
  });
});
afterEach(() => {
  useTranslationState.setState({ language: 'en' });
  cleanup();
  useTranslationState.setState({ language: 'en' });
  client.clear();
  vi.clearAllMocks();
});

function mount(onResume = vi.fn(), onConfigure = vi.fn(), row = controller) {
  return render(
    <QueryClientProvider client={client}>
      <ControllersTable
        controllers={[row]}
        sessions={[session]}
        onResume={onResume}
        onConfigure={onConfigure}
        onClaim={vi.fn()}
        onRemove={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

async function openDetails(name = 'Fixture') {
  fireEvent.click(screen.getByRole('button', { name: `Details for ${name}` }));
  return await screen.findByRole('dialog');
}
defineRootTestRegistrationsTests();

export function defineRootTestRegistrationsTests() {
  const scope = {
    mount,
    openDetails,
    get getUpdateStatus() {
      return getUpdateStatus;
    },
    get client() {
      return client;
    },
    set client(value: typeof client) {
      client = value;
    },
    get getRootPassword() {
      return getRootPassword;
    },
    get getVerification() {
      return getVerification;
    },
    get verified() {
      return verified;
    },
    get controller() {
      return controller;
    },
    get retryRuntimeUpdate() {
      return retryRuntimeUpdate;
    },
    get retryManagedAccess() {
      return retryManagedAccess;
    },
    get getSessionStatus() {
      return getSessionStatus;
    },
    get session() {
      return session;
    },
  };

  registerHidesViewProgressOnceEnrollmentIsVerifiedKeepingConfigurationAndRuntimeInfoReachable(scope);

  registerExplainsTheDestructiveReEnrolmentRequiredForLegacyControllers(scope);

  registerDoesNotAskUsersToResumeCommissioningWhenVerifiedManagementFinishesAutomatically(scope);

  registerShowsTheSavedSshSetupFailureInTheDetailsDrawerInTheSelectedLanguage(scope);

  registerShowsTheActualConfigurationPrerequisiteAndAutomaticSshProgressWithoutAContinueAction(scope);

  it('shows the specific runtime blocker and recovery steps when reconciliation has no update record', async () => {
    getUpdateStatus.mockResolvedValue({ management: 'managed', sessionId: 7, update: null, blocker: 'runtime_assets' });
    mount();
    await openDetails();
    expect(await screen.findByText(/missing or invalid CC100 runtime assets/)).toBeTruthy();
  });

  registerShowsAutomaticUpdateProgressAndBeforeAfterVersionsInlineThroughCompletion(scope);

  registerDistinguishesBuildsSharingAVersionAndShowsFailuresWithoutAnActiveProgressBar(scope);

  registerShowsAnUnderstandableFallbackForFutureUnknownUpdateFailures(scope);

  registerTranslatesRuntimeRetriesAndRecoveryInPlaceWhenTheHostLanguageChanges(scope);

  registerShowsDurableUpdateFailureAndRequestsRecoverySecretsOnlyOnTheExplicitAuditedAction(scope);

  registerDoesNotInferEnrollmentVerificationFromAnOnlineClaimedRow(scope);

  registerWithholdsTheRuntimeVerifiedLabelWhileAnEnrolledControllerRequiresAnUpdate(scope);

  registerShowsStartupSoftwareVerificationWithoutAnnouncingOrQueuingAnUpdate(scope);

  registerKeepsAnOfflineControllerVisiblyNotRespondingWhileRuntimeVerificationIsPending(scope);

  registerKeepsAnOfflineUpdateFailureVisibleWithoutReplacingConnectivityWithThePendingImageMismat(scope);

  registerOffersARuntimeRetryForAManagedControllerInSWithoutRetryingEnrolment(scope);

  registerOffersManagedAccessRetryForAnEnrolmentRequiringRecovery(scope);

  registerKeepsAdministratorRecoveryAvailableForARemovedControllerSession(scope);

  registerDoesNotDisplayALateRecoverySecretResponseAfterTheRecoverySectionCloses(scope);

  it('keeps configuration pending separate from verified enrollment', async () => {
    getVerification.mockResolvedValue({ ...verified, configurationApplied: false, hardwareReadiness: 'not_ready' });
    mount();
    await openDetails();
    expect(await screen.findByText('Configuration pending')).toBeTruthy();
  });

  registerWithdrawsCachedSuccessWhenVerificationPollingFails(scope);

  registerKeepsSessionRecoveryReachableWhenMergedIntoAnUntrustedControllerRow(scope);

  registerCanTransitionBetweenEmptyAndPopulatedCollectionsWithoutChangingHookOrder(scope);

  registerKeepsDetailedFailuresAndAdministratorControlsOutOfTheCompactTable(scope);

  registerRendersAndPollsOnlyTheCurrentPageAndFindsDevicesByNameIdAndAddress(scope);

  registerUsesNaturalGermanColumnAndRegistrationLabels(scope);

  registerDiscardsARecoveryPasswordResponseWhenTheDetailsDrawerCloses(scope);

  registerTranslatesRecognizedSavedFailuresOnMountedControllerRowsWhileRetainingUnknownText(scope);

  return scope;
}

export type RootTestRegistrationsTestScope = ReturnType<typeof defineRootTestRegistrationsTests>;
