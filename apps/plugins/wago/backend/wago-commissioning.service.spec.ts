import { createHash } from 'node:crypto';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import {
  isSupportedController,
  runtimeBundleInstallScript,
  WagoCommissioningService,
} from './wago-commissioning.service';
import { WagoService } from './wago.service';
import { fw31IdentityOutput, fw31OsRelease } from './fixtures/fw31-identity';
import { registerStreamsSafeCheckpointsAndBoundsAnSshProcessThatStallsS } from './wago-commissioning.service.streams-safe-checkpoints-and-bounds-an-ssh-process-that-stalls-s.test-cases';
import { registerDrainsCheckpointWritesBeforeSavingAPreparationFailure } from './wago-commissioning.service.drains-checkpoint-writes-before-saving-a-preparation-failure.test-cases';
import { registerFinishesAStalledUploadWithinTheRemainingBudgetEvenWhenSshNeverEmitsClose } from './wago-commissioning.service.finishes-a-stalled-upload-within-the-remaining-budget-even-when-ssh-never-emits-close.test-cases';
import { registerChecksFw31ManagementToolsBeforePreparationAndRetainsTheActionableReason } from './wago-commissioning.service.checks-fw31-management-tools-before-preparation-and-retains-the-actionable-reason.test-cases';
import { registerRetainsOnlyFixedUploadDiagnosticsAndSshExitStatusNeverRemoteSecrets } from './wago-commissioning.service.retains-only-fixed-upload-diagnostics-and-ssh-exit-status-never-remote-secrets.test-cases';
import { registerReportsStagingCapacityFailuresWithoutSuggestingControllerPreparationCleanup } from './wago-commissioning.service.reports-staging-capacity-failures-without-suggesting-controller-preparation-cleanup.test-cases';
import { registerKeepsALockBusyPreparationRetryableWithoutAPhantomRecoveryToken } from './wago-commissioning.service.keeps-a-lock-busy-preparation-retryable-without-a-phantom-recovery-token.test-cases';
import { registerMapsOnlyTheBoundedStorageDiagnosticFromSshStderrToAFixedMessage } from './wago-commissioning.service.maps-only-the-bounded-storage-diagnostic-from-ssh-stderr-to-a-fixed-message.test-cases';
import { registerMapsOnlyTheExactPreJournalLockDiagnosticFromSshStderr } from './wago-commissioning.service.maps-only-the-exact-pre-journal-lock-diagnostic-from-ssh-stderr.test-cases';
import { registerDistinguishesSWithoutTreatingRemoteTextAsTrustedDiagnostics } from './wago-commissioning.service.distinguishes-s-without-treating-remote-text-as-trusted-diagnostics.test-cases';
import { registerReportsTheFixedImageLoadFailureWithoutExposingOtherRemoteOutput } from './wago-commissioning.service.reports-the-fixed-image-load-failure-without-exposing-other-remote-output.test-cases';
import { registerReleasesASettledLocalRejectionSoACorrectedRequestCanRetry } from './wago-commissioning.service.releases-a-settled-local-rejection-so-a-corrected-request-can-retry.test-cases';
import { registerSerializesOperationsForTheSameControllerInThisProcess } from './wago-commissioning.service.serializes-operations-for-the-same-controller-in-this-process.test-cases';
import { registerRequiresLiteralInstallationConsentP } from './wago-commissioning.service.requires-literal-installation-consent-p.test-cases';
import { registerRejectsMissingOrInvalidExplicitCredentialsP } from './wago-commissioning.service.rejects-missing-or-invalid-explicit-credentials-p.test-cases';
import { registerNeverResumesSshAtStartupAndMakesInterruptedSessionsRetryable } from './wago-commissioning.service.never-resumes-ssh-at-startup-and-makes-interrupted-sessions-retryable.test-cases';
import { registerDoesNotRequireAnEnrolledControllerLeaseJustToReadItsSavedStateAtStartup } from './wago-commissioning.service.does-not-require-an-enrolled-controller-lease-just-to-read-its-saved-state-at-startup.test-cases';
import { registerRevokesAndClearsLegacyPlaintextBeforeRegisteringDiscoveryUsingBoundedPages } from './wago-commissioning.service.revokes-and-clears-legacy-plaintext-before-registering-discovery-using-bounded-pages.test-cases';
import { registerFailsClosedWithSafeErrorsDuringSRecoveryFailure } from './wago-commissioning.service.fails-closed-with-safe-errors-during-s-recovery-failure.test-cases';
import { registerInvalidatesEveryPlaintextVerifierEvenWhenTheFirstBrokerRevocationFails } from './wago-commissioning.service.invalidates-every-plaintext-verifier-even-when-the-first-broker-revocation-fails.test-cases';
import { registerRejectsALegacyVerifierOnDirectDiscoveryWithoutPassingItToClaim } from './wago-commissioning.service.rejects-a-legacy-verifier-on-direct-discovery-without-passing-it-to-claim.test-cases';
import { registerReconcilesAPersistedClaimAfterRestartWithoutRevokingOrReinstalling } from './wago-commissioning.service.reconciles-a-persisted-claim-after-restart-without-revoking-or-reinstalling.test-cases';
import { registerReplaysSavedEarlyDiscoveryAfterHandlerRegistration } from './wago-commissioning.service.replays-saved-early-discovery-after-handler-registration.test-cases';
import { registerQueuesEarlyDiscoveryUntilDeliveryFinishesAndDoesNotReportVerifiedSuccess } from './wago-commissioning.service.queues-early-discovery-until-delivery-finishes-and-does-not-report-verified-success.test-cases';
import { registerDoesNotExposeSubprocessSDuringHostKeyScanning } from './wago-commissioning.service.does-not-expose-subprocess-s-during-host-key-scanning.test-cases';
import { registerReportsCryptoErrorsSafelyAndNeverSubstitutesPlaintextForEncryption } from './wago-commissioning.service.reports-crypto-errors-safely-and-never-substitutes-plaintext-for-encryption.test-cases';
import { registerRejectsInvalidArtifactsBeforeInspectionProvisioningOrRevokingPriorEnrollment } from './wago-commissioning.service.rejects-invalid-artifacts-before-inspection-provisioning-or-revoking-prior-enrollment.test-cases';
import { registerBlocksUnavailableProvisioningBeforeSshMutations } from './wago-commissioning.service.blocks-unavailable-provisioning-before-ssh-mutations.test-cases';
import { registerDeliverySProtectsSecretsAndCleansVerifiedArtifacts } from './wago-commissioning.service.delivery-s-protects-secrets-and-cleans-verified-artifacts.test-cases';
import { registerRequiresRecoveryConfirmationP } from './wago-commissioning.service.requires-recovery-confirmation-p.test-cases';
import { registerExplicitlyRecoversWithoutNewArtifactsBrokerProvisioningOrAcceptance } from './wago-commissioning.service.explicitly-recovers-without-new-artifacts-broker-provisioning-or-acceptance.test-cases';
import { registerReportsRecoveryFailureSafelyAndDoesNotRevokeCredentialsWhenRemoteRecoveryFails } from './wago-commissioning.service.reports-recovery-failure-safely-and-does-not-revoke-credentials-when-remote-recovery-fails.test-cases';
import { registerReportsBoundedLockContentionAsCleanupGuidanceInsteadOfACredentialFailure } from './wago-commissioning.service.reports-bounded-lock-contention-as-cleanup-guidance-instead-of-a-credential-failure.test-cases';
import { registerKeepsInterruptedClaimsBlockedAfterFailedRecoveryAndRequiresANewSessionAfterRestoration } from './wago-commissioning.service.keeps-interrupted-claims-blocked-after-failed-recovery-and-requires-a-new-session-after-restoration.test-cases';
import { registerRetriesOnlyRevocationAfterRestorationSucceedsIncludingAfterRestart } from './wago-commissioning.service.retries-only-revocation-after-restoration-succeeds-including-after-restart.test-cases';
import { registerSerializesDifferentSessionsForTheSameControllerWithinThisServiceProcess } from './wago-commissioning.service.serializes-different-sessions-for-the-same-controller-within-this-service-process.test-cases';
import { registerDefersRepositoryAccessUntilPluginModuleInitialization } from './wago-commissioning.service.defers-repository-access-until-plugin-module-initialization.test-cases';
import { registerStreamsTheFullPrivilegedInspectionOverStdinForS } from './wago-commissioning.service.streams-the-full-privileged-inspection-over-stdin-for-s.test-cases';
import { registerDoesNotAddASudoPasswordToRootCommandInput } from './wago-commissioning.service.does-not-add-a-sudo-password-to-root-command-input.test-cases';
import { registerSendsASudoPasswordBeforeCommandInputForAlternateSshUsers } from './wago-commissioning.service.sends-a-sudo-password-before-command-input-for-alternate-ssh-users.test-cases';
import { registerWaitsForSshKeygenBeforeRemovingTheScannedHostKey } from './wago-commissioning.service.waits-for-ssh-keygen-before-removing-the-scanned-host-key.test-cases';
import { registerSerializesRevocationWithInProgressDeliveryWorkForTheSameSession } from './wago-commissioning.service.serializes-revocation-with-in-progress-delivery-work-for-the-same-session.test-cases';
import { registerDoesNotExposeStoredCommissioningVerifiersInSessionLists } from './wago-commissioning.service.does-not-expose-stored-commissioning-verifiers-in-session-lists.test-cases';
import { registerRequiresTheAdministratorToConfirmTheScannedHostKeyBeforeDelivery } from './wago-commissioning.service.requires-the-administrator-to-confirm-the-scanned-host-key-before-delivery.test-cases';
import { registerRejectsDirectDeliveryBeforeTheScannedHostKeyIsConfirmed } from './wago-commissioning.service.rejects-direct-delivery-before-the-scanned-host-key-is-confirmed.test-cases';
import { registerRevokesAndRemovesAnEnrollmentSessionWithoutRetainingItsRecords } from './wago-commissioning.service.revokes-and-removes-an-enrollment-session-without-retaining-its-records.test-cases';
import { registerAutomaticallyClaimsEachConcurrentSessionOnlyForItsBoundDiscovery } from './wago-commissioning.service.automatically-claims-each-concurrent-session-only-for-its-bound-discovery.test-cases';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
const verifier = 'v'.repeat(43);
const secrets = {
  encrypt: jest.fn().mockReturnValue('opaque-ciphertext'),
  decrypt: jest.fn().mockReturnValue(verifier),
};

describe('WagoCommissioningService', () => {
  defineWagoCommissioningServiceTests();
});

export function defineWagoCommissioningServiceTests() {
  const scope = {
    get securityHarness() {
      return securityHarness;
    },
    get verifier() {
      return verifier;
    },
    get configuredService() {
      return configuredService;
    },
    get secrets() {
      return secrets;
    },
  };
  registerStreamsSafeCheckpointsAndBoundsAnSshProcessThatStallsS(scope);

  registerDrainsCheckpointWritesBeforeSavingAPreparationFailure(scope);

  registerFinishesAStalledUploadWithinTheRemainingBudgetEvenWhenSshNeverEmitsClose(scope);
  registerChecksFw31ManagementToolsBeforePreparationAndRetainsTheActionableReason(scope);
  registerRetainsOnlyFixedUploadDiagnosticsAndSshExitStatusNeverRemoteSecrets(scope);

  registerReportsStagingCapacityFailuresWithoutSuggestingControllerPreparationCleanup(scope);

  registerKeepsALockBusyPreparationRetryableWithoutAPhantomRecoveryToken(scope);

  registerMapsOnlyTheBoundedStorageDiagnosticFromSshStderrToAFixedMessage(scope);

  registerMapsOnlyTheExactPreJournalLockDiagnosticFromSshStderr(scope);

  registerDistinguishesSWithoutTreatingRemoteTextAsTrustedDiagnostics(scope);

  registerReportsTheFixedImageLoadFailureWithoutExposingOtherRemoteOutput(scope);

  registerReleasesASettledLocalRejectionSoACorrectedRequestCanRetry(scope);

  registerSerializesOperationsForTheSameControllerInThisProcess(scope);

  function securityHarness(overrides: Partial<WagoCommissioningSession> = {}, Service = WagoCommissioningService) {
    const session = {
      id: 1,
      hardwareId: 'cc100-test',
      mqttServerId: 2,
      enrollmentId: null,
      pairingCode: 'encrypted:v1:opaque-ciphertext',
      deliveryToken: 'a'.repeat(32),
      state: 'awaiting_delivery',
      controllerName: 'Test',
      auditLog: '[]',
      ...overrides,
    } as WagoCommissioningSession;
    const repository = {
      find: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn().mockResolvedValue(session),
      save: jest.fn(async (value) => value),
    };
    const wago = {
      registerCommissioningDiscoveryHandler: jest.fn(),
      revokeEnrollmentById: jest.fn().mockResolvedValue(undefined),
      createEnrollment: jest.fn(),
      claim: jest.fn(),
    };
    const context = {
      getRepository: jest.fn().mockReturnValue(repository),
      getMqttServerConfig: jest.fn().mockResolvedValue({ host: 'mock.invalid', port: 8883, useTls: true }),
      getMqttCredentialProvisioning: jest
        .fn()
        .mockReturnValue({ availableProviders: jest.fn().mockResolvedValue([{ providerId: 'mock' }]) }),
      secrets: { encrypt: jest.fn().mockReturnValue('ciphertext'), decrypt: jest.fn().mockReturnValue(verifier) },
      logger: { warn: jest.fn() },
    };
    const service = new Service(context as unknown as PluginContext, wago as unknown as WagoService);
    service['sessions'] = repository as never;
    const inspect = jest.fn().mockRejectedValue(new Error('arbitrary-secret'));
    const sudo = jest.fn().mockResolvedValue('');
    service['inspect'] = inspect;
    service['sudoRun'] = sudo;
    return { service, session, repository, wago, context, inspect, sudo };
  }

  registerRequiresLiteralInstallationConsentP(scope);

  registerRejectsMissingOrInvalidExplicitCredentialsP(scope);

  registerNeverResumesSshAtStartupAndMakesInterruptedSessionsRetryable(scope);

  registerDoesNotRequireAnEnrolledControllerLeaseJustToReadItsSavedStateAtStartup(scope);

  registerRevokesAndClearsLegacyPlaintextBeforeRegisteringDiscoveryUsingBoundedPages(scope);

  registerFailsClosedWithSafeErrorsDuringSRecoveryFailure(scope);

  registerInvalidatesEveryPlaintextVerifierEvenWhenTheFirstBrokerRevocationFails(scope);

  registerRejectsALegacyVerifierOnDirectDiscoveryWithoutPassingItToClaim(scope);

  it('does not emit arbitrary broker claim errors', async () => {
    const { service, session, wago } = securityHarness({ state: 'awaiting_discovery', enrollmentId: 7 });
    wago.claim.mockRejectedValue(new Error('unlabelled-secret'));
    await service.claimDiscovered({ id: 4, hardwareId: session.hardwareId, mqttServerId: 2, enrollmentId: 7 });
    expect(session.failureReason).toBe('Automatic claim failed.');
  });

  registerReconcilesAPersistedClaimAfterRestartWithoutRevokingOrReinstalling(scope);

  registerReplaysSavedEarlyDiscoveryAfterHandlerRegistration(scope);

  registerQueuesEarlyDiscoveryUntilDeliveryFinishesAndDoesNotReportVerifiedSuccess(scope);

  registerDoesNotExposeSubprocessSDuringHostKeyScanning(scope);

  registerReportsCryptoErrorsSafelyAndNeverSubstitutesPlaintextForEncryption(scope);

  function configuredService() {
    // Runtime availability comes only from the verified server-owned catalog.
    const digest = createHash('sha256').update(Buffer.from('mock runtime bundle')).digest('hex');
    return class extends WagoCommissioningService {
      constructor(context: PluginContext, wago: WagoService) {
        super(context, wago, {
          has: async () => true,
          current: async () => ({ digest }),
          acquire: async () => ({
            directory: '/mock/staging',
            path: '/mock/staging/runtime.tar',
            bytes: 19,
            digest,
            image: `test.invalid/runtime@sha256:${'a'.repeat(64)}`,
          }),
        } as never);
      }
    };
  }

  registerRejectsInvalidArtifactsBeforeInspectionProvisioningOrRevokingPriorEnrollment(scope);

  registerBlocksUnavailableProvisioningBeforeSshMutations(scope);

  registerDeliverySProtectsSecretsAndCleansVerifiedArtifacts(scope);

  registerRequiresRecoveryConfirmationP(scope);

  registerExplicitlyRecoversWithoutNewArtifactsBrokerProvisioningOrAcceptance(scope);

  registerReportsRecoveryFailureSafelyAndDoesNotRevokeCredentialsWhenRemoteRecoveryFails(scope);

  registerReportsBoundedLockContentionAsCleanupGuidanceInsteadOfACredentialFailure(scope);

  registerKeepsInterruptedClaimsBlockedAfterFailedRecoveryAndRequiresANewSessionAfterRestoration(scope);

  registerRetriesOnlyRevocationAfterRestorationSucceedsIncludingAfterRestart(scope);

  registerSerializesDifferentSessionsForTheSameControllerWithinThisServiceProcess(scope);

  it('extracts runtime bundles without emitting controller-clock timestamp warnings', () => {
    const script = runtimeBundleInstallScript(`ghcr.io/attraccess/wago@sha256:${'a'.repeat(64)}`);
    expect(script).toContain('tar --warning=no-timestamp --warning=no-unknown-keyword -xOf');
    expect(script).toContain("-e 's/^Loaded image ID: //p'");
  });

  it('requires framed FW31 identity including REVISIONS and the supported baseline', () => {
    expect(isSupportedController(fw31IdentityOutput(fw31OsRelease, ''), '31')).toBe(false);
    expect(isSupportedController(fw31IdentityOutput(), '31')).toBe(true);
    expect(isSupportedController(fw31IdentityOutput(), '32')).toBe(false);
  });

  registerDefersRepositoryAccessUntilPluginModuleInitialization(scope);

  registerStreamsTheFullPrivilegedInspectionOverStdinForS(scope);

  registerDoesNotAddASudoPasswordToRootCommandInput(scope);

  registerSendsASudoPasswordBeforeCommandInputForAlternateSshUsers(scope);

  registerWaitsForSshKeygenBeforeRemovingTheScannedHostKey(scope);

  registerSerializesRevocationWithInProgressDeliveryWorkForTheSameSession(scope);

  registerDoesNotExposeStoredCommissioningVerifiersInSessionLists(scope);

  registerRequiresTheAdministratorToConfirmTheScannedHostKeyBeforeDelivery(scope);

  registerRejectsDirectDeliveryBeforeTheScannedHostKeyIsConfirmed(scope);

  registerRevokesAndRemovesAnEnrollmentSessionWithoutRetainingItsRecords(scope);

  registerAutomaticallyClaimsEachConcurrentSessionOnlyForItsBoundDiscovery(scope);

  return scope;
}

export type WagoCommissioningServiceTestScope = ReturnType<typeof defineWagoCommissioningServiceTests>;
