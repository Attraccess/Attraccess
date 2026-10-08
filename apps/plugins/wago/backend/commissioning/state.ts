import { Inject, Optional } from '@nestjs/common';

import { AsyncLocalStorage } from 'node:async_hooks';

import { PLUGIN_CONTEXT, PluginContext, Repository } from '@attraccess/plugins-backend-sdk';

import { WagoCommissioningSession } from './session.entity';

import { WagoService } from '../controllers/service';

import { WagoRuntimeArtifactsService, WagoRuntimeArtifactCatalog } from '../runtime/artifacts/catalog';

import { WagoCommissioningReadiness } from './readiness';

import { type CommissioningOperationGuard } from '../runtime/operation-guard';

import { WagoManagementService } from '../management/service';

import { WagoManagedRuntimeService } from '../runtime/managed/service';

import { type commissioningVerification } from './verification';

import { type Cc100HardwareProfile } from '../../shared/hardware-profile';

import { CommissioningPrincipal } from './audit';

import {
  type ManagementTarget,
  type ManagementMode,
  type ManagementException,
  type ManagementPublicStatus,
} from '../management/model';

import { type CommissioningCheckpoint } from './progress';

import { TemporarySshCredential } from './model';

import { SshRunLimits } from './model';

import { CommissioningSessionResponse } from './model';

import { DeliveryInput } from './model';

import { RuntimeDeliveryBundle } from './model';

export abstract class WagoCommissioningServiceState {
  constructor(
    @Inject(PLUGIN_CONTEXT) protected readonly context: PluginContext,
    @Inject(WagoService) protected readonly wago: WagoService,
    @Optional() @Inject(WagoRuntimeArtifactsService) protected readonly artifacts?: WagoRuntimeArtifactCatalog,
    @Optional() @Inject(WagoCommissioningReadiness) protected readonly readiness?: WagoCommissioningReadiness,
    @Optional() @Inject(WagoManagedRuntimeService) protected readonly managedRuntime?: WagoManagedRuntimeService,
  ) {}

  protected sessions!: Repository<WagoCommissioningSession>;

  protected management!: WagoManagementService;

  protected readonly operationContext = new AsyncLocalStorage<CommissioningOperationGuard>();

  protected readonly controllerLocks = new Map<string, Promise<void>>();

  protected readonly deliveryLocks = new Map<number, Promise<void>>();

  protected readonly transferWrites = new Map<number, Promise<void>>();

  protected readonly activeDeadlines = new Map<number, number>();

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
