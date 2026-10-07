import type { commissioningVerification } from './wago-commissioning-verification';
import { type Cc100HardwareProfile } from '../shared/hardware-profile';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { CommissioningPrincipal } from './wago-commissioning-audit';
import type { CommissioningOperationGuard } from './wago-operation-guard';
import type { ManagementTarget, ManagementMode, ManagementException } from './wago-management.types';
import { type CommissioningCheckpoint } from './wago-commissioning-progress';
import { TemporarySshCredential } from './wago-commissioning.service.temporary-ssh-credential';
import { SshRunLimits } from './wago-commissioning.service.ssh-run-limits';
import { CommissioningSessionResponse } from './wago-commissioning.service.commissioning-session-response';
import { DeliveryInput } from './wago-commissioning.service.delivery-input';
import { RuntimeDeliveryBundle } from './wago-commissioning.service.runtime-delivery-bundle';
import type { ManagementPublicStatus } from './wago-management.types';

export abstract class WagoCommissioningServiceOnApplicationBootstrapContract {
  abstract onApplicationBootstrap(): Promise<void>;
  abstract support(): Promise<{ firmwareBaseline: string | null; ready: boolean }>;
  abstract create(
    input: {
      mqttServerId: number;
      targetHost: string;
      name: string;
    },
    principal?: CommissioningPrincipal | null,
  ): Promise<CommissioningSessionResponse>;
  abstract confirmHostKey(
    id: number,
    hostKeyFingerprint: string,
    trustMethod?: 'trusted_inventory' | 'isolated_service_connection',
    physicalIdentityConfirmed?: boolean,
  ): Promise<CommissioningSessionResponse>;
  abstract list(limit?: number, offset?: number): Promise<CommissioningSessionResponse[]>;
  abstract verification(id: number): Promise<
    Omit<Awaited<ReturnType<typeof commissioningVerification>>, 'managementHardening'> & {
      managementHardening: string;
      softwareReady: boolean;
    }
  >;
  protected abstract reconcileDiscovery(): Promise<void>;
  abstract platform(
    id: number,
    action: 'inspect' | 'activate' | 'recover',
    input: {
      temporarySsh?: TemporarySshCredential;
      reviewedDockerActivation?: boolean;
    },
    principal?: CommissioningPrincipal | null,
  ): Promise<CommissioningSessionResponse>;
  protected abstract cleanupControllerPreparation(
    session: WagoCommissioningSession,
    credential: TemporarySshCredential,
  ): Promise<void>;
  protected abstract prepareController(
    session: WagoCommissioningSession,
    credential: TemporarySshCredential,
    verifiedBundleBytes: number,
    hardwareProfile?: Cc100HardwareProfile,
  ): Promise<void>;
  abstract managementStatus(id: number): Promise<ManagementPublicStatus | null>;
  abstract manageSecurity(
    id: number,
    action: 'inspect' | 'review' | 'apply' | 'recover',
    input: {
      temporarySsh?: TemporarySshCredential;
      mode?: ManagementMode;
      exceptions?: ManagementException[];
      reviewToken?: string;
      confirm?: boolean;
    },
    principal?: CommissioningPrincipal | null,
  ): Promise<ManagementPublicStatus>;
  protected abstract manageSecurityWhileAudited(
    id: number,
    action: 'inspect' | 'review' | 'apply' | 'recover',
    input: {
      temporarySsh?: TemporarySshCredential;
      mode?: ManagementMode;
      exceptions?: ManagementException[];
      reviewToken?: string;
      confirm?: boolean;
    },
  ): Promise<ManagementPublicStatus>;
  protected abstract verifyManagementKey(
    target: ManagementTarget,
    username: string,
    privateKey: string,
    nonce: string,
    limits: { timeoutMs: number; maxOutputBytes: number },
  ): Promise<{
    nonce: string;
    hostKeyFingerprint: string;
    keyFingerprint: string;
    keyOnly: boolean;
    uid: number;
    managementOperationSucceeded: boolean;
  }>;
  abstract deliver(
    id: number,
    input?: DeliveryInput,
    principal?: CommissioningPrincipal | null,
  ): Promise<CommissioningSessionResponse>;
  protected abstract loadDeliverableSession(id: number): Promise<WagoCommissioningSession>;
  protected abstract requireRuntimeArtifact(): Promise<void>;
  protected abstract deliverWhileLocked(
    id: number,
    input: DeliveryInput,
    principal?: CommissioningPrincipal | null,
  ): Promise<CommissioningSessionResponse>;
  protected abstract acquireRuntimeBundle(session: WagoCommissioningSession): Promise<RuntimeDeliveryBundle>;
  protected abstract assertCurrentRuntimeBundle(bundle: { digest: string; image?: string }): Promise<void>;
  abstract recover(
    id: number,
    input?: DeliveryInput,
    principal?: CommissioningPrincipal | null,
  ): Promise<CommissioningSessionResponse>;
  protected abstract recoverWhileAudited(id: number, input: DeliveryInput): Promise<CommissioningSessionResponse>;
  protected abstract withControllerLock<T>(id: number, operation: () => Promise<T>): Promise<T>;
  abstract revoke(id: number): Promise<CommissioningSessionResponse>;
  abstract remove(id: number): Promise<void>;
  abstract removeByHardwareId(hardwareId: string): Promise<void>;
  abstract operateControllerSafely<T>(
    id: number,
    operation: (assertOwned: () => Promise<void>, guard: CommissioningOperationGuard) => Promise<T>,
    requireCommissioningSession?: boolean,
  ): Promise<T>;
  abstract removeControllerSafely(
    id: number,
    remove: (assertOwned: () => Promise<void>) => Promise<string>,
  ): Promise<void>;
  abstract claimDiscovered(controller: {
    id: number;
    hardwareId: string;
    mqttServerId: number | null;
    enrollmentId: number | null;
  }): Promise<void>;
  protected abstract inspect(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
  ): Promise<{ firmware: string; codesys: string }>;
  protected abstract sudoRun(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    command: string,
    input?: string,
    limits?: SshRunLimits,
  ): Promise<string>;
  protected abstract sudoRunScript(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    script: string,
    limits?: SshRunLimits,
  ): Promise<string>;
  protected abstract remoteOperation<T>(operation: () => Promise<T>): Promise<T>;
  protected abstract run(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    command: string,
    input?: string,
    limits?: SshRunLimits,
  ): Promise<string>;
  protected abstract copyTo(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    source: string,
    script: string,
    onProgress: (percent: number) => void,
  ): Promise<void>;
  protected abstract save(session: WagoCommissioningSession, event: string): Promise<WagoCommissioningSession>;
  protected abstract updateProgress(
    session: WagoCommissioningSession,
    percent: number,
    step: string,
    detail: string,
  ): Promise<void>;
  protected abstract reportTransferProgress(session: WagoCommissioningSession, percent: number): void;
  protected abstract reportPreparationProgress(
    session: WagoCommissioningSession,
    checkpoint: CommissioningCheckpoint,
  ): void;
  protected abstract encryptVerifier(plaintext: string): string;
  protected abstract decryptVerifier(session: WagoCommissioningSession): string;
  protected abstract revokeSessionEnrollment(session: WagoCommissioningSession): Promise<void>;
  protected abstract invalidateVerifier(session: WagoCommissioningSession): Promise<void>;
  protected abstract recoverSessions(): Promise<void>;
  protected abstract reconcileCompletedSessions(): Promise<void>;
  protected abstract retireSupersededSessions(hardwareId: string, completedSessionId: number): Promise<void>;
  protected abstract toResponse(session: WagoCommissioningSession): Promise<CommissioningSessionResponse>;
  protected abstract withDeliveryLock<T>(id: number, operation: () => Promise<T>): Promise<T>;
}
