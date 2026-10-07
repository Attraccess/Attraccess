import { DataSource } from 'typeorm';
import { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { registerManagedEnrolmentAndDurableCredentialLifecycleStartsBackgroundReconciliationOnBootstrapWithoutAdditionalConfiguration } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-starts-background-reconciliation-on-bootstrap-without-additional-configuration.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleCoalescesRepeatedHeartbeatWakesIntoOneBoundedFleetScanWindow } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-coalesces-repeated-heartbeat-wakes-into-one-bounded-fleet-scan-window.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleProcessesANewConnectionImmediatelyInsideTheFleetScanCooldown } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-processes-a-new-connection-immediately-inside-the-fleet-scan-cooldown.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleConfirmsTheInstalledImagePolicyForARebuiltReleaseOfTheSameVersion } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-confirms-the-installed-image-policy-for-a-rebuilt-release-of-the-same-version.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecyclePersistsAuthenticatedCiphertextBeforeRemoteMutationAndRotatesPerEnrolment } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-persists-authenticated-ciphertext-before-remote-mutation-and-rotates-per-enrolment.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleDoesNotMutateRemotelyWhenEncryptionFailsOrReturnsPlaintext } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-does-not-mutate-remotely-when-encryption-fails-or-returns-plaintext.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleVerifiesTheEncryptedDatabaseRoundTripAndFailsBeforeRemoteChangesWhenStorageIsCorrupt } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-verifies-the-encrypted-database-round-trip-and-fails-before-remote-changes-when-storage-is-corrupt.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleRetainsThePendingIdentityAfterLostKeyCleanupAndRetriesWithoutGeneratingReplacementSecre } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-retains-the-pending-identity-after-lost-key-cleanup-and-retries-without-generating-replacement-secre.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleRetainsRecoveryIntentOnFailedSecondKeyConnectionWithoutDisablingSshPolicy } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-retains-recovery-intent-on-failed-second-key-connection-without-disabling-ssh-policy.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleRequiresARecordedAdministratorAuditBeforeDecryptingDisclosingRootRecovery } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-requires-a-recorded-administrator-audit-before-decrypting-disclosing-root-recovery.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleSelectsEncryptedRecoveryAccessOnlyAfterProvingThePinnedRootLogin } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-selects-encrypted-recovery-access-only-after-proving-the-pinned-root-login.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleRejectsEncryptedEnvelopesCopiedToAnotherControllerSession } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-rejects-encrypted-envelopes-copied-to-another-controller-session.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleVisiblyBlocksUnreadableManagedCredentialsWithoutExposingTheEnvelope } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-visibly-blocks-unreadable-managed-credentials-without-exposing-the-envelope.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleRetainsRetirementIntentAndRecoverySecretsUntilRemoteKeyRemovalIsIndependentlyVerified } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-retains-retirement-intent-and-recovery-secrets-until-remote-key-removal-is-independently-verified.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleSharesDeviceOwnershipAcrossProcessesAndFencesExpiredOwnersWithoutReleasingASuccessor } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-shares-device-ownership-across-processes-and-fences-expired-owners-without-releasing-a-successor.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleDoesNotResurrectRetirementRecordedWhileManagedAccessRetryAcquiresItsLease } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-does-not-resurrect-retirement-recorded-while-managed-access-retry-acquires-its-lease.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleFencesRuntimeRetriesWhenRetirementWinsOwnershipAndRetainsPendingRecoveryMetadata } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-fences-runtime-retries-when-retirement-wins-ownership-and-retains-pending-recovery-metadata.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleExplainsTheSPrerequisiteHoldingUpAutomaticSshCompletionWithoutTouchingSsh } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-explains-the-s-prerequisite-holding-up-automatic-ssh-completion-without-touching-ssh.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleReconcilesSCutoverWithRebootProofBeforeANewCommit } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-reconciles-s-cutover-with-reboot-proof-before-a-new-commit.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleUpdatesWithTheBoundSshIdentityAndASPriorHeartbeatAfterServerRestart } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-updates-with-the-bound-ssh-identity-and-a-s-prior-heartbeat-after-server-restart.test-cases';
import { registerManagedEnrolmentAndDurableCredentialLifecycleRejectsSAsReplacementReadinessWithoutRelyingOnALiveOldRuntime } from './wago-managed-runtime.managed-enrolment-and-durable-credential-lifecycle-rejects-s-as-replacement-readiness-without-relying-on-a-live-old-runtime.test-cases';
import { resetTestFixture } from './wago-managed-runtime.setup.test-fixture';
import { artifact } from './wago-managed-runtime.spec.artifact';
import { principal } from './wago-managed-runtime.spec.principal';

export function defineManagedEnrolmentAndDurableCredentialLifecycleTests() {
  let db: DataSource;
  let service: WagoManagedRuntimeService;
  let encrypt: jest.Mock;
  let decrypt: jest.Mock;
  let audit: jest.Mock;
  let rootProbe: jest.Mock;
  let context: PluginContext;
  const session = (id = 1) =>
    Object.assign(new WagoCommissioningSession(), {
      id,
      targetHost: '10.77.0.7',
      hostKeyFingerprint: `SHA256:${'a'.repeat(43)}`,
      hardwareId: `cc100-${id}`,
    });

  beforeEach(async () => {
    await resetTestFixture(scope);
  });
  afterEach(async () => {
    await service.onModuleDestroy();
    await new Promise(setImmediate);
    await db.destroy();
    jest.clearAllMocks();
  });
  const scope = {
    get context() {
      return context;
    },
    set context(value: typeof context) {
      context = value;
    },
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get artifact() {
      return artifact;
    },
    get db() {
      return db;
    },
    set db(value: typeof db) {
      db = value;
    },
    get decrypt() {
      return decrypt;
    },
    set decrypt(value: typeof decrypt) {
      decrypt = value;
    },
    get session() {
      return session;
    },
    get rootProbe() {
      return rootProbe;
    },
    set rootProbe(value: typeof rootProbe) {
      rootProbe = value;
    },
    get principal() {
      return principal;
    },
    get encrypt() {
      return encrypt;
    },
    set encrypt(value: typeof encrypt) {
      encrypt = value;
    },
    get audit() {
      return audit;
    },
    set audit(value: typeof audit) {
      audit = value;
    },
  };

  registerManagedEnrolmentAndDurableCredentialLifecycleStartsBackgroundReconciliationOnBootstrapWithoutAdditionalConfiguration(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleCoalescesRepeatedHeartbeatWakesIntoOneBoundedFleetScanWindow(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleProcessesANewConnectionImmediatelyInsideTheFleetScanCooldown(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleConfirmsTheInstalledImagePolicyForARebuiltReleaseOfTheSameVersion(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecyclePersistsAuthenticatedCiphertextBeforeRemoteMutationAndRotatesPerEnrolment(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleDoesNotMutateRemotelyWhenEncryptionFailsOrReturnsPlaintext(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleVerifiesTheEncryptedDatabaseRoundTripAndFailsBeforeRemoteChangesWhenStorageIsCorrupt(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleRetainsThePendingIdentityAfterLostKeyCleanupAndRetriesWithoutGeneratingReplacementSecre(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleRetainsRecoveryIntentOnFailedSecondKeyConnectionWithoutDisablingSshPolicy(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleRequiresARecordedAdministratorAuditBeforeDecryptingDisclosingRootRecovery(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleSelectsEncryptedRecoveryAccessOnlyAfterProvingThePinnedRootLogin(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleRejectsEncryptedEnvelopesCopiedToAnotherControllerSession(scope);

  registerManagedEnrolmentAndDurableCredentialLifecycleVisiblyBlocksUnreadableManagedCredentialsWithoutExposingTheEnvelope(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleRetainsRetirementIntentAndRecoverySecretsUntilRemoteKeyRemovalIsIndependentlyVerified(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleSharesDeviceOwnershipAcrossProcessesAndFencesExpiredOwnersWithoutReleasingASuccessor(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleDoesNotResurrectRetirementRecordedWhileManagedAccessRetryAcquiresItsLease(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleFencesRuntimeRetriesWhenRetirementWinsOwnershipAndRetainsPendingRecoveryMetadata(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleExplainsTheSPrerequisiteHoldingUpAutomaticSshCompletionWithoutTouchingSsh(
    scope,
  );

  registerManagedEnrolmentAndDurableCredentialLifecycleReconcilesSCutoverWithRebootProofBeforeANewCommit(scope);

  registerManagedEnrolmentAndDurableCredentialLifecycleUpdatesWithTheBoundSshIdentityAndASPriorHeartbeatAfterServerRestart(
    scope,
  );
  registerManagedEnrolmentAndDurableCredentialLifecycleRejectsSAsReplacementReadinessWithoutRelyingOnALiveOldRuntime(
    scope,
  );

  return scope;
}
