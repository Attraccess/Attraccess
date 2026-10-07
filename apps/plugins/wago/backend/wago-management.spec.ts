import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { WagoManagementService } from './wago-management';
import type {
  ManagementAdapter,
  ManagementInspection,
  ManagementMode,
  ManagementQualification,
  ManagementRecord,
  ManagementStore,
  ManagementTarget,
  ManagementTransaction,
} from './wago-management.types';
import { registerDoesNotPersistAReviewAfterOuterOwnershipIsLostDuringTheRead } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';
import { registerDoesNotStartRollbackAfterOuterOwnershipIsLostDuringPersistence } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';
import { registerRequiresExplicitInspectAndReviewAndSerializesTheCompleteVerifyBeforeDisableTransition } from './wago-management.rejects-invalid-second-connection-proof-s.test-cases';
import { registerBlocksMissingFirmwareEvidenceS } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';
import { registerDoesNotTurnAnInstalledRootKeyOrUnqualifiedPrivilegesIntoHardened } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';
import { registerRejectsInvalidSecondConnectionProofS } from './wago-management.rejects-invalid-second-connection-proof-s.test-cases';
import { registerFailedSecondConnectionRollsBackWithoutLeakingTransportSecrets } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';
import { registerPostRestrictionVerificationFailureRollsBackBeforeDisarmingTheWatchdog } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';
import { registerRetainsEncryptedKeyAndJournalOnRollbackFailureThenExplicitlyRecoversWithFreshCredential } from './wago-management.rejects-invalid-second-connection-proof-s.test-cases';
import { registerRestartDuringHardeningNeverRetriesRestrictionsAndWaitsForTheCrashedWriterLease } from './wago-management.rejects-invalid-second-connection-proof-s.test-cases';
import { registerExceptionsNeverBecomeHardenedAndAdditiveModeNeverDisablesAccess } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';
import { registerInvalidGeneratedKeyOrEncryptionFailureNeverReachesTheController } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';
import { registerBoundsReviewsRejectsArbitraryScriptsAndRequiresReinspectionAfterDrift } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';
import { registerSerializesPerControllerAcrossServiceInstancesWithoutBlockingOtherControllers } from './wago-management.rejects-invalid-second-connection-proof-s.test-cases';
import { registerRefusesRestrictionsWithoutAConfirmedRebootSafeWatchdog } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';
import { registerRetainsRecoveryIdentityWhenTheFinalRecoveryDatabaseWriteFails } from './wago-management.rejects-invalid-second-connection-proof-s.test-cases';
import { registerAnExpiredTransitionCannotDisableAccessAndAThirdConnectionFailureCannotCommit } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';
import { registerDoesNotLetAReviewedBaselineExposureExceptionImplyHardened } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';
import { registerDropsUnexpectedInspectionPropertiesAndNeverForwardsAFullBaselineCommandThroughTheBuilt } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';
import { registerMakesTheRetainedGeneratedKeyAvailableOnlyToTheTrustedRecoveryAdapterAfterRestart } from './wago-management.an-expired-transition-cannot-disable-access-and-a-third-connection-failure-cannot-commit.test-cases';

const target: ManagementTarget = { controllerId: 7, host: '10.77.0.7', hostKeyFingerprint: `SHA256:${'a'.repeat(43)}` };
const credential = { username: 'operator', password: 'test-session-only-password' };
const observation: ManagementInspection = {
  model: 'cc100',
  firmware: '31',
  ssh: 'openssh',
  serviceControl: 'sysv',
  uid: 1004,
  wbm: 'not_observed',
  otherManagement: 'not_observed',
  networkScope: 'local_socket_observation',
  passwordAccess: 'unknown',
  defaultAccess: 'unknown',
};

class MemoryStore implements ManagementStore {
  records = new Map<number, ManagementRecord>();
  leases = new Map<number, { owner: string; until: number }>();
  history: ManagementRecord[] = [];
  async load(id: number) {
    return structuredClone(this.records.get(id) ?? null);
  }
  async acquire(id: number, owner: string, now: number, until: number) {
    if ((this.leases.get(id)?.until ?? 0) >= now) return false;
    this.leases.set(id, { owner, until });
    return true;
  }
  async save(id: number, owner: string, record: ManagementRecord, now: number) {
    if (this.leases.get(id)?.owner !== owner || this.leases.get(id)!.until < now) throw new Error('lease_lost');
    this.records.set(id, structuredClone(record));
    this.history.push(structuredClone(record));
  }
  async release(id: number, owner: string) {
    if (this.leases.get(id)?.owner === owner) this.leases.delete(id);
  }
}

function harness() {
  const store = new MemoryStore();
  const encryptionKey = randomBytes(32);
  const secrets = {
    encrypt: jest.fn((plaintext: string) => {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
      return Buffer.concat([iv, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]).toString('base64');
    }),
    decrypt: jest.fn((ciphertext: string) => {
      const bytes = Buffer.from(ciphertext, 'base64'),
        cipher = createDecipheriv('aes-256-gcm', encryptionKey, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString();
    }),
  };
  const calls: string[] = [];
  let keyFingerprint = '';
  const operation = (name: string) =>
    jest.fn(async () => {
      calls.push(name);
    });
  const adapter = {
    inspect: jest.fn(async () => ({ ...observation })),
    // Qualified only inside this mock; never shipped as a real platform provider.
    qualify: jest.fn<ManagementQualification, [ManagementInspection, ManagementMode]>(() => ({
      support: 'supported',
      evidence: 'fw31-qualified-baseline',
      minimumPrivileges: true,
      rebootSafeWatchdog: true,
    })),
    prepare: operation('prepare'),
    armWatchdog: jest.fn(async () => {
      calls.push('arm');
      return { armed: true, rebootSafe: true };
    }),
    installKey: jest.fn(async (_tx: ManagementTransaction, _credential: unknown, publicKey: string) => {
      calls.push('install');
      keyFingerprint = `SHA256:${createHash('sha256')
        .update(Buffer.from(publicKey.split(' ')[1], 'base64'))
        .digest('base64')
        .replace(/=+$/, '')}`;
    }),
    verifyKey: jest.fn(async (_tx: ManagementTransaction, _privateKey: string, nonce: string) => {
      calls.push('verify');
      return {
        nonce,
        hostKeyFingerprint: target.hostKeyFingerprint,
        keyFingerprint,
        keyOnly: true,
        uid: observation.uid!,
        managementOperationSucceeded: true,
      };
    }),
    restrictAccess: operation('restrict'),
    verifyBaseline: jest.fn(async () => {
      calls.push('baseline');
      return {
        passwordDisabled: true,
        defaultAccessDisabled: true,
        minimumPrivileges: true,
        wbmSecure: true,
        otherManagementSecure: true,
      };
    }),
    commit: operation('commit'),
    rollback: operation('rollback'),
  } satisfies ManagementAdapter;
  let clock = 1000000;
  const service = new WagoManagementService(store, secrets, adapter, () => clock);
  const review = async () => {
    await service.inspect(target, credential);
    return service.review(target.controllerId, { mode: 'baseline', exceptions: [] });
  };
  const apply = (reviewToken: string) =>
    service.apply(target.controllerId, { reviewToken, confirm: true, temporarySsh: credential });
  return {
    store,
    secrets,
    adapter,
    service,
    calls,
    review,
    apply,
    advance: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
  };
}

describe('management transition orchestration (no device or broker connections)', () => {
  defineManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTests();
});

export function defineManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTests() {
  const scope = {
    harness,
    get target() {
      return target;
    },
    get credential() {
      return credential;
    },
    get observation() {
      return observation;
    },
  };
  registerDoesNotPersistAReviewAfterOuterOwnershipIsLostDuringTheRead(scope);

  registerDoesNotStartRollbackAfterOuterOwnershipIsLostDuringPersistence(scope);

  registerRequiresExplicitInspectAndReviewAndSerializesTheCompleteVerifyBeforeDisableTransition(scope);

  registerBlocksMissingFirmwareEvidenceS(scope);

  registerDoesNotTurnAnInstalledRootKeyOrUnqualifiedPrivilegesIntoHardened(scope);

  registerRejectsInvalidSecondConnectionProofS(scope);

  registerFailedSecondConnectionRollsBackWithoutLeakingTransportSecrets(scope);

  registerPostRestrictionVerificationFailureRollsBackBeforeDisarmingTheWatchdog(scope);

  registerRetainsEncryptedKeyAndJournalOnRollbackFailureThenExplicitlyRecoversWithFreshCredential(scope);

  registerRestartDuringHardeningNeverRetriesRestrictionsAndWaitsForTheCrashedWriterLease(scope);

  registerExceptionsNeverBecomeHardenedAndAdditiveModeNeverDisablesAccess(scope);

  registerInvalidGeneratedKeyOrEncryptionFailureNeverReachesTheController(scope);

  registerBoundsReviewsRejectsArbitraryScriptsAndRequiresReinspectionAfterDrift(scope);

  registerSerializesPerControllerAcrossServiceInstancesWithoutBlockingOtherControllers(scope);

  registerRefusesRestrictionsWithoutAConfirmedRebootSafeWatchdog(scope);

  registerRetainsRecoveryIdentityWhenTheFinalRecoveryDatabaseWriteFails(scope);

  registerAnExpiredTransitionCannotDisableAccessAndAThirdConnectionFailureCannotCommit(scope);

  registerDoesNotLetAReviewedBaselineExposureExceptionImplyHardened(scope);

  registerDropsUnexpectedInspectionPropertiesAndNeverForwardsAFullBaselineCommandThroughTheBuilt(scope);

  registerMakesTheRetainedGeneratedKeyAvailableOnlyToTheTrustedRecoveryAdapterAfterRestart(scope);

  return scope;
}

export type ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope = ReturnType<
  typeof defineManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTests
>;
