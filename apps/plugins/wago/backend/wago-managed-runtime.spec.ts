import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoNetworkChange, WagoMqttCredentialRetirement } from './wago-network-change.entity';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoService } from './wago.service';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { managedSsh } from './wago-managed-ssh';
import type { BuildRuntimeArtifact } from './wago-build-runtime';
import { registerStartsBackgroundReconciliationOnBootstrapWithoutAdditionalConfiguration } from './wago-managed-runtime.shares-device-ownership-across-processes-and-fences-expired-owners-without-releasing-a-successor.test-cases';
import { registerCoalescesRepeatedHeartbeatWakesIntoOneBoundedFleetScanWindow } from './wago-managed-runtime.coalesces-repeated-heartbeat-wakes-into-one-bounded-fleet-scan-window.test-cases';
import { registerProcessesANewConnectionImmediatelyInsideTheFleetScanCooldown } from './wago-managed-runtime.inspects-the-running-image-without-interrupting-a-busy-hardware-supervisor-s-stat.test-cases';
import { registerPersistsAuthenticatedCiphertextBeforeRemoteMutationAndRotatesPerEnrolment } from './wago-managed-runtime.inspects-the-running-image-without-interrupting-a-busy-hardware-supervisor-s-stat.test-cases';
import { registerDoesNotMutateRemotelyWhenEncryptionFailsOrReturnsPlaintext } from './wago-managed-runtime.coalesces-repeated-heartbeat-wakes-into-one-bounded-fleet-scan-window.test-cases';
import { registerVerifiesTheEncryptedDatabaseRoundTripAndFailsBeforeRemoteChangesWhenStorageIsCorrupt } from './wago-managed-runtime.shares-device-ownership-across-processes-and-fences-expired-owners-without-releasing-a-successor.test-cases';
import { registerRetainsThePendingIdentityAfterLostKeyCleanupAndRetriesWithoutGeneratingReplacementSecre } from './wago-managed-runtime.inspects-the-running-image-without-interrupting-a-busy-hardware-supervisor-s-stat.test-cases';
import { registerRetainsRecoveryIntentOnFailedSecondKeyConnectionWithoutDisablingSshPolicy } from './wago-managed-runtime.inspects-the-running-image-without-interrupting-a-busy-hardware-supervisor-s-stat.test-cases';
import { registerRequiresARecordedAdministratorAuditBeforeDecryptingDisclosingRootRecovery } from './wago-managed-runtime.inspects-the-running-image-without-interrupting-a-busy-hardware-supervisor-s-stat.test-cases';
import { registerSelectsEncryptedRecoveryAccessOnlyAfterProvingThePinnedRootLogin } from './wago-managed-runtime.inspects-the-running-image-without-interrupting-a-busy-hardware-supervisor-s-stat.test-cases';
import { registerVisiblyBlocksUnreadableManagedCredentialsWithoutExposingTheEnvelope } from './wago-managed-runtime.shares-device-ownership-across-processes-and-fences-expired-owners-without-releasing-a-successor.test-cases';
import { registerRetainsRetirementIntentAndRecoverySecretsUntilRemoteKeyRemovalIsIndependentlyVerified } from './wago-managed-runtime.inspects-the-running-image-without-interrupting-a-busy-hardware-supervisor-s-stat.test-cases';
import { registerSharesDeviceOwnershipAcrossProcessesAndFencesExpiredOwnersWithoutReleasingASuccessor } from './wago-managed-runtime.shares-device-ownership-across-processes-and-fences-expired-owners-without-releasing-a-successor.test-cases';
import { registerDoesNotResurrectRetirementRecordedWhileManagedAccessRetryAcquiresItsLease } from './wago-managed-runtime.coalesces-repeated-heartbeat-wakes-into-one-bounded-fleet-scan-window.test-cases';
import { registerFencesRuntimeRetriesWhenRetirementWinsOwnershipAndRetainsPendingRecoveryMetadata } from './wago-managed-runtime.coalesces-repeated-heartbeat-wakes-into-one-bounded-fleet-scan-window.test-cases';
import { registerExplainsTheSPrerequisiteHoldingUpAutomaticSshCompletionWithoutTouchingSsh } from './wago-managed-runtime.coalesces-repeated-heartbeat-wakes-into-one-bounded-fleet-scan-window.test-cases';
import { registerReconcilesSCutoverWithRebootProofBeforeANewCommit } from './wago-managed-runtime.reconciles-s-cutover-with-reboot-proof-before-a-new-commit.test-cases';
import { registerUsesTheBoundIdentityAfterRestartDespiteANewerUnusedSessionPublishingInstallerChangesAn } from './wago-managed-runtime.uses-the-bound-identity-after-restart-despite-a-newer-unused-session-publishing-installer-changes-an.test-cases';
import { registerReportsTheLegacyReceiverCapabilityWithoutTakingTheMutationLock } from './wago-managed-runtime.inspects-the-running-image-without-interrupting-a-busy-hardware-supervisor-s-stat.test-cases';
import { registerReportsUpdateStorageRequirementsWithoutWritingControllerStateSStat } from './wago-managed-runtime.inspects-the-running-image-without-interrupting-a-busy-hardware-supervisor-s-stat.test-cases';
import { registerInspectsTheRunningImageWithoutInterruptingABusyHardwareSupervisorSStat } from './wago-managed-runtime.inspects-the-running-image-without-interrupting-a-busy-hardware-supervisor-s-stat.test-cases';
import { registerUsesTheSameRtuContractInStageActivationAcceptanceAndRecoveryAndPreservesFixedDiagnosti } from './wago-managed-runtime.shares-device-ownership-across-processes-and-fences-expired-owners-without-releasing-a-successor.test-cases';
import { registerProvisionsOnActualFw31ToolsWithoutChpasswdGetentOrVisudoAndRestoresInterruptedCutoverR } from './wago-managed-runtime.provisions-on-actual-fw31-tools-without-chpasswd-getent-or-visudo-and-restores-interrupted-cutover-r.test-cases';
import { registerAcceptsRealCommissioningJournalsInDependencyOrderAndFencesForeignTokensBeforeCleanupS } from './wago-managed-runtime.accepts-real-commissioning-journals-in-dependency-order-and-fences-foreign-tokens-before-cleanup-s.test-cases';
import { registerExecutesAFullRepeatedImageUpdateThroughOnlyTheFixedDispatcherPreservingEnrolledStateS } from './wago-managed-runtime.coalesces-repeated-heartbeat-wakes-into-one-bounded-fleet-scan-window.test-cases';
import { registerGeneratesValidPosixShellWithDynamicBoundedArtifactParametersNoSuppliedScriptsEval } from './wago-managed-runtime.coalesces-repeated-heartbeat-wakes-into-one-bounded-fleet-scan-window.test-cases';
import { registerMigratesCredentialUpdateOperationStorageTogetherAndRefusesDestructiveDowngradeWithCredent } from './wago-managed-runtime.inspects-the-running-image-without-interrupting-a-busy-hardware-supervisor-s-stat.test-cases';

jest.mock('@attraccess/plugins-backend-sdk', () => jest.requireActual('typeorm'));
jest.mock('./wago.service', () => ({ WagoService: class {} }));
jest.mock('./wago-runtime-artifacts', () => ({ WagoRuntimeArtifactsService: class {} }));
jest.mock('./wago-commissioning-readiness', () => ({ WagoCommissioningReadiness: class {} }));
jest.mock('./wago-managed-ssh', () => ({ ...jest.requireActual('./wago-managed-ssh'), managedSsh: jest.fn() }));
jest.mock('./wago-commissioning-verification', () => ({ commissioningVerification: jest.fn() }));

const artifact: BuildRuntimeArtifact = {
  imageId: `sha256:${'1'.repeat(64)}`,
  image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'2'.repeat(64)}`,
  buildId: '3'.repeat(40),
  digest: '4'.repeat(64),
  bytes: 81920,
  manifest: {
    schemaVersion: 1,
    runtime: 'attraccess-wago-cc100',
    runtimeVersion: '0.1.0',
    protocolVersion: '1.0.0',
    image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'2'.repeat(64)}`,
    hardware: {
      model: '751-9301',
      platform: 'linux/arm/v7',
      firmwareBaseline: '31',
      profile: 'cc100-751-9301-fw31-digital-v1',
    },
  },
};
const principal = { userId: 7, authenticationMethod: 'session' as const };

describe('managed enrolment and durable credential lifecycle', () => {
  defineManagedEnrolmentAndDurableCredentialLifecycleTests();
});

describe('fixed managed executor and recovery programs', () => {
  defineFixedManagedExecutorAndRecoveryProgramsTests();
});

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
    db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [
        WagoManagedAccess,
        WagoNetworkChange,
        WagoMqttCredentialRetirement,
        WagoRuntimeUpdateEntity,
        WagoDeviceOperation,
        WagoController,
        WagoCommissioningSession,
      ],
      synchronize: true,
    }).initialize();
    const key = randomBytes(32);
    encrypt = jest.fn((plaintext: string) => {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([iv, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]).toString('base64');
    });
    decrypt = jest.fn((envelope: string) => {
      const bytes = Buffer.from(envelope, 'base64'),
        cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString();
    });
    audit = jest.fn(async () => ({ status: 'recorded' }));
    context = {
      getRepository: (entity: never) => db.getRepository(entity),
      secrets: { encrypt, decrypt },
      audit: { record: audit },
      logger: { warn: jest.fn() },
    } as unknown as PluginContext;
    service = new WagoManagedRuntimeService(
      context,
      {
        registerRuntimeStatusHandler: jest.fn(),
        getSettings: async () => ({ operationalPrefix: 'attraccess/wago' }),
      } as unknown as WagoService,
      { current: async () => artifact } as WagoRuntimeArtifactsService,
      {} as unknown as WagoCommissioningReadiness,
    );
    service.onApplicationBootstrap();
    rootProbe = jest.fn(async () => true);
    service.registerRootProbe(rootProbe);
    jest
      .mocked(managedSsh)
      .mockImplementation(async (_access, _key, header) =>
        header.startsWith('proof ') ? `OK ${header.split(' ')[1]}\n` : 'OK\n',
      );
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

  registerStartsBackgroundReconciliationOnBootstrapWithoutAdditionalConfiguration(scope);

  registerCoalescesRepeatedHeartbeatWakesIntoOneBoundedFleetScanWindow(scope);

  registerProcessesANewConnectionImmediatelyInsideTheFleetScanCooldown(scope);

  registerPersistsAuthenticatedCiphertextBeforeRemoteMutationAndRotatesPerEnrolment(scope);

  registerDoesNotMutateRemotelyWhenEncryptionFailsOrReturnsPlaintext(scope);

  registerVerifiesTheEncryptedDatabaseRoundTripAndFailsBeforeRemoteChangesWhenStorageIsCorrupt(scope);

  registerRetainsThePendingIdentityAfterLostKeyCleanupAndRetriesWithoutGeneratingReplacementSecre(scope);

  registerRetainsRecoveryIntentOnFailedSecondKeyConnectionWithoutDisablingSshPolicy(scope);

  registerRequiresARecordedAdministratorAuditBeforeDecryptingDisclosingRootRecovery(scope);

  registerSelectsEncryptedRecoveryAccessOnlyAfterProvingThePinnedRootLogin(scope);

  it('rejects encrypted envelopes copied to another controller/session', async () => {
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    await db.getRepository(WagoManagedAccess).update(1, { fingerprint: `SHA256:${'b'.repeat(43)}` });
    await expect(service.recoverPassword(1, principal)).rejects.toThrow('does not match');
  });

  registerVisiblyBlocksUnreadableManagedCredentialsWithoutExposingTheEnvelope(scope);

  registerRetainsRetirementIntentAndRecoverySecretsUntilRemoteKeyRemovalIsIndependentlyVerified(scope);

  registerSharesDeviceOwnershipAcrossProcessesAndFencesExpiredOwnersWithoutReleasingASuccessor(scope);

  registerDoesNotResurrectRetirementRecordedWhileManagedAccessRetryAcquiresItsLease(scope);

  registerFencesRuntimeRetriesWhenRetirementWinsOwnershipAndRetainsPendingRecoveryMetadata(scope);

  registerExplainsTheSPrerequisiteHoldingUpAutomaticSshCompletionWithoutTouchingSsh(scope);

  registerReconcilesSCutoverWithRebootProofBeforeANewCommit(scope);

  registerUsesTheBoundIdentityAfterRestartDespiteANewerUnusedSessionPublishingInstallerChangesAn(scope);

  return scope;
}

export type ManagedEnrolmentAndDurableCredentialLifecycleTestScope = ReturnType<
  typeof defineManagedEnrolmentAndDurableCredentialLifecycleTests
>;

export function defineFixedManagedExecutorAndRecoveryProgramsTests() {
  const scope = {
    get artifact() {
      return artifact;
    },
  };
  registerReportsTheLegacyReceiverCapabilityWithoutTakingTheMutationLock(scope);
  registerReportsUpdateStorageRequirementsWithoutWritingControllerStateSStat(scope);
  registerInspectsTheRunningImageWithoutInterruptingABusyHardwareSupervisorSStat(scope);
  registerUsesTheSameRtuContractInStageActivationAcceptanceAndRecoveryAndPreservesFixedDiagnosti(scope);
  registerProvisionsOnActualFw31ToolsWithoutChpasswdGetentOrVisudoAndRestoresInterruptedCutoverR(scope);
  registerAcceptsRealCommissioningJournalsInDependencyOrderAndFencesForeignTokensBeforeCleanupS(scope);
  registerExecutesAFullRepeatedImageUpdateThroughOnlyTheFixedDispatcherPreservingEnrolledStateS(scope);
  registerGeneratesValidPosixShellWithDynamicBoundedArtifactParametersNoSuppliedScriptsEval(scope);

  registerMigratesCredentialUpdateOperationStorageTogetherAndRefusesDestructiveDowngradeWithCredent(scope);

  return scope;
}

export type FixedManagedExecutorAndRecoveryProgramsTestScope = ReturnType<
  typeof defineFixedManagedExecutorAndRecoveryProgramsTests
>;
