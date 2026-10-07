import { DataSource } from 'typeorm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import plugin from './plugin';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoService } from './wago.service';
import { fw31IdentityOutput } from './fixtures/fw31-identity';
import { registerGatesEnrollmentAndTlsRuntimeDeliveryOnSClockCorrection } from './wago-commissioning-workflow.gates-enrollment-and-tls-runtime-delivery-on-s-clock-correction.test-cases';
import { registerNeverInspectsOrChangesTheClockWhenInstallConsentIsAbsent } from './wago-commissioning-workflow.never-inspects-or-changes-the-clock-when-install-consent-is-absent.test-cases';
import { registerRechecksClockContinuityAfterEnrollmentRevocationAndBeforeIssuingACredential } from './wago-commissioning-workflow.rechecks-clock-continuity-after-enrollment-revocation-and-before-issuing-a-credential.test-cases';
import { registerBlocksAnUnfinishedPreparationBeforeAnyFurtherHostMutation } from './wago-commissioning-workflow.blocks-an-unfinished-preparation-before-any-further-host-mutation.test-cases';
import { registerActivatesUnderDurableOwnershipAndRecordsCodesysDisabledOnlyAfterPreparationSucceeds } from './wago-commissioning-workflow.activates-under-durable-ownership-and-records-codesys-disabled-only-after-preparation-succeeds.test-cases';
import { registerBlocksSBeforeTokensPlcPreparationClockChangesOrEnrollmentWhenStagingIsInsufficient } from './wago-commissioning-workflow.blocks-s-before-tokens-plc-preparation-clock-changes-or-enrollment-when-staging-is-insufficient.test-cases';
import { registerNeverBypassesStagingInSWhenVerifiedBytesAreUnavailable } from './wago-commissioning-workflow.never-bypasses-staging-in-s-when-verified-bytes-are-unavailable.test-cases';
import { registerReplacesALegacySessionDigestWithTheCurrentReleaseWhenAcquiringADeliverySnapshot } from './wago-commissioning-workflow.replaces-a-legacy-session-digest-with-the-current-release-when-acquiring-a-delivery-snapshot.test-cases';
import { registerDeliversTheCurrentBuildToALegacySessionWhoseStoredDigestBelongsToAnOlderBuild } from './wago-commissioning-workflow.delivers-the-current-build-to-a-legacy-session-whose-stored-digest-belongs-to-an-older-build.test-cases';
import { registerDoesNotTransferASnapshotAfterTheCurrentReleaseChangesMidDelivery } from './wago-commissioning-workflow.does-not-transfer-a-snapshot-after-the-current-release-changes-mid-delivery.test-cases';
import { registerFailsVisiblyInsteadOfClaimingAnObsoleteRuntimeWhenTheReleaseChangesDuringSshTransfer } from './wago-commissioning-workflow.fails-visibly-instead-of-claiming-an-obsolete-runtime-when-the-release-changes-during-ssh-transfer.test-cases';
import { registerAllowsInactiveDockerThroughStagingThenActivatesBeforeFullHardwareAndCapacityChecks } from './wago-commissioning-workflow.allows-inactive-docker-through-staging-then-activates-before-full-hardware-and-capacity-checks.test-cases';
import { registerRequiresExplicitDestructivePreparationApproval } from './wago-commissioning-workflow.requires-explicit-destructive-preparation-approval.test-cases';
import { registerRetainsInterruptedSPreparationForExplicitCleanupAfterRestart } from './wago-commissioning-workflow.retains-interrupted-s-preparation-for-explicit-cleanup-after-restart.test-cases';
import { registerFailsClosedBeforeEnrollmentOrDeliveryWhenActiveCodesysCannotBeDisabled } from './wago-commissioning-workflow.fails-closed-before-enrollment-or-delivery-when-active-codesys-cannot-be-disabled.test-cases';
import { registerRetainsAnOldRestoredTokenWhenFinalLifecycleReconciliationFails } from './wago-commissioning-workflow.retains-an-old-restored-token-when-final-lifecycle-reconciliation-fails.test-cases';
import { registerResolvesTheCurrentArtifactAndCarriesAnExistingDockerTokenIntoTheRuntimeTransaction } from './wago-commissioning-workflow.resolves-the-current-artifact-and-carries-an-existing-docker-token-into-the-runtime-transaction.test-cases';
import { registerRetriesOnlyPreparationAcknowledgementAfterRuntimeCleanupAndPreparationContainmentSucceeded } from './wago-commissioning-workflow.retries-only-preparation-acknowledgement-after-runtime-cleanup-and-preparation-containment-succeeded.test-cases';
import { registerRetainsMatchingPreparationOwnershipForCleanupWhenUploadFailsBeforeARemoteRuntimeJournal } from './wago-commissioning-workflow.retains-matching-preparation-ownership-for-cleanup-when-upload-fails-before-a-remote-runtime-journal.test-cases';
import { registerRetainsTokenedRecoveryAfterRegistrationRemovalWithoutExposingTheToken } from './wago-commissioning-workflow.retains-tokened-recovery-after-registration-removal-without-exposing-the-token.test-cases';
import { registerRetiresSupersededSessionsWithoutDeadlockingAQueuedRevocation } from './wago-commissioning-workflow.retires-superseded-sessions-without-deadlocking-a-queued-revocation.test-cases';
import { registerAllowsSessionDeletionAfterReadOnlyManagementInspectionWithoutRequiringImpossibleRollback } from './wago-commissioning-workflow.allows-session-deletion-after-read-only-management-inspection-without-requiring-impossible-rollback.test-cases';
import { registerDoesNotRetainAnInspectionOnlySessionAfterControllerRegistrationRemoval } from './wago-commissioning-workflow.does-not-retain-an-inspection-only-session-after-controller-registration-removal.test-cases';
import { registerRefusesADowngradeThatWouldDiscardADockerRecoveryToken } from './wago-commissioning-workflow.refuses-a-downgrade-that-would-discard-a-docker-recovery-token.test-cases';

describe('commissioning workflows with a real isolated database and mocked device transport', () => {
  defineCommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTests();
});

export function defineCommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTests() {
  let db: DataSource;
  let directory: string;
  let service: WagoCommissioningService;
  let context: PluginContext;
  let session: WagoCommissioningSession;
  let artifacts: { has: jest.Mock; current: jest.Mock; get: jest.Mock; acquire: jest.Mock };
  const principal = { userId: 42, authenticationMethod: 'session' as const };
  const credential = { username: 'root', password: 'fixture-only' };
  const digest = 'a'.repeat(64);
  const stoppedReport =
    'version=1\nplatform=supported\nhardware=accessible\nexclusivity=clear\ndocker=installed-stopped\nconfigDocker=present\nprovision=review-start-installed-runtime\nqualification=required\n';
  const clockOutput = () =>
    `epoch=${Math.floor(Date.now() / 1000)}\nuptime=100.00\nboot=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\ntool=supported\n`;
  const wago = {
    registerCommissioningDiscoveryHandler: jest.fn(),
    revokeEnrollmentById: jest.fn().mockResolvedValue(undefined),
    createEnrollment: jest.fn().mockResolvedValue({
      id: 7,
      password: 'bootstrap-fixture',
      username: 'fixture',
      claimSecret: 'claim-fixture',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'wago-workflow-fixture-'));
    db = new DataSource({ type: 'sqlite', database: ':memory:', entities: plugin.entities, synchronize: true });
    await db.initialize();
    context = {
      getRepository: (entity) => db.getRepository(entity),
      secrets: { encrypt: () => 'ciphertext', decrypt: () => 'v'.repeat(43) },
      logger: { warn: jest.fn() },
      audit: { record: jest.fn().mockResolvedValue({ status: 'recorded' }) },
      getMqttServerConfig: jest.fn().mockResolvedValue({ host: 'broker.example.test', port: 8883, useTls: true }),
      getMqttCredentialProvisioning: () => ({ availableProviders: async () => [{ providerId: 'fixture' }] }),
    } as unknown as PluginContext;
    artifacts = {
      has: jest.fn().mockResolvedValue(true),
      current: jest.fn().mockResolvedValue({ digest }),
      get: jest.fn().mockResolvedValue({ digest }),
      acquire: jest.fn().mockResolvedValue({
        digest,
        bytes: 512,
        image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${digest}`,
        path: join(directory, 'runtime.tar'),
        directory,
      }),
    };
    service = new WagoCommissioningService(
      context,
      wago as unknown as WagoService,
      artifacts as unknown as WagoRuntimeArtifactsService,
    );
    await service.onApplicationBootstrap();
    session = await db.getRepository(WagoCommissioningSession).save({
      hardwareId: 'fixture',
      mqttServerId: 1,
      targetHost: '10.99.0.1',
      hostKeyFingerprint: `SHA256:${'A'.repeat(43)}`,
      firmwareBaseline: '31',
      controllerName: 'Fixture',
      state: 'awaiting_delivery',
      pairingCode: 'encrypted:v1:ciphertext',
      auditLog: '[]',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runtimeArtifactDigest: digest,
    });
    jest
      .spyOn(service as never, 'inspect')
      .mockResolvedValue({ firmware: fw31IdentityOutput(), codesys: 'inactive' } as never);
  });
  afterEach(async () => {
    await db.destroy();
    await rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });
  const scope = {
    get wago() {
      return wago;
    },
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get session() {
      return session;
    },
    set session(value: typeof session) {
      session = value;
    },
    get credential() {
      return credential;
    },
    get clockOutput() {
      return clockOutput;
    },
    get principal() {
      return principal;
    },
    get db() {
      return db;
    },
    set db(value: typeof db) {
      db = value;
    },
    get artifacts() {
      return artifacts;
    },
    set artifacts(value: typeof artifacts) {
      artifacts = value;
    },
    get directory() {
      return directory;
    },
    set directory(value: typeof directory) {
      directory = value;
    },
    get digest() {
      return digest;
    },
    get stoppedReport() {
      return stoppedReport;
    },
  };

  registerGatesEnrollmentAndTlsRuntimeDeliveryOnSClockCorrection(scope);

  registerNeverInspectsOrChangesTheClockWhenInstallConsentIsAbsent(scope);

  registerRechecksClockContinuityAfterEnrollmentRevocationAndBeforeIssuingACredential(scope);

  registerBlocksAnUnfinishedPreparationBeforeAnyFurtherHostMutation(scope);

  registerActivatesUnderDurableOwnershipAndRecordsCodesysDisabledOnlyAfterPreparationSucceeds(scope);

  registerBlocksSBeforeTokensPlcPreparationClockChangesOrEnrollmentWhenStagingIsInsufficient(scope);

  registerNeverBypassesStagingInSWhenVerifiedBytesAreUnavailable(scope);

  registerReplacesALegacySessionDigestWithTheCurrentReleaseWhenAcquiringADeliverySnapshot(scope);

  registerDeliversTheCurrentBuildToALegacySessionWhoseStoredDigestBelongsToAnOlderBuild(scope);

  registerDoesNotTransferASnapshotAfterTheCurrentReleaseChangesMidDelivery(scope);

  registerFailsVisiblyInsteadOfClaimingAnObsoleteRuntimeWhenTheReleaseChangesDuringSshTransfer(scope);

  registerAllowsInactiveDockerThroughStagingThenActivatesBeforeFullHardwareAndCapacityChecks(scope);

  registerRequiresExplicitDestructivePreparationApproval(scope);

  registerRetainsInterruptedSPreparationForExplicitCleanupAfterRestart(scope);

  registerFailsClosedBeforeEnrollmentOrDeliveryWhenActiveCodesysCannotBeDisabled(scope);

  registerRetainsAnOldRestoredTokenWhenFinalLifecycleReconciliationFails(scope);

  registerResolvesTheCurrentArtifactAndCarriesAnExistingDockerTokenIntoTheRuntimeTransaction(scope);

  registerRetriesOnlyPreparationAcknowledgementAfterRuntimeCleanupAndPreparationContainmentSucceeded(scope);

  registerRetainsMatchingPreparationOwnershipForCleanupWhenUploadFailsBeforeARemoteRuntimeJournal(scope);

  registerRetainsTokenedRecoveryAfterRegistrationRemovalWithoutExposingTheToken(scope);

  registerRetiresSupersededSessionsWithoutDeadlockingAQueuedRevocation(scope);

  registerAllowsSessionDeletionAfterReadOnlyManagementInspectionWithoutRequiringImpossibleRollback(scope);

  registerDoesNotRetainAnInspectionOnlySessionAfterControllerRegistrationRemoval(scope);

  registerRefusesADowngradeThatWouldDiscardADockerRecoveryToken(scope);

  return scope;
}

export type CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope = ReturnType<
  typeof defineCommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTests
>;
