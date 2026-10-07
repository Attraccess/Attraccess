import { randomUUID } from 'node:crypto';
import { OutputController } from './output-controller';
import { DiscoveryClaim } from './runtime-protocol';
import {
  type DeviceAdapter,
  type RuntimeState,
  type StateStore,
  type Transport,
  type ValidationError,
} from './runtime-types';
export abstract class RuntimeContext {
  protected state: RuntimeState = { outputs: {}, commandIds: [], commandExpiries: {} };

  protected connected = true;

  protected loaded = false;

  protected configurationPending = false;

  protected runtimeUpdateRequired: boolean;

  protected runtimeFailsafePending = false;

  protected runtimePolicyToken = randomUUID();

  protected measurementsPending = false;

  protected readonly streamId = randomUUID();

  protected connectionPolicies = Promise.resolve();

  protected readonly inFlightCommandIds = new Set<string>();

  protected readonly outputs: OutputController;

  protected configurationUpdates = Promise.resolve();

  protected statePublication?: Promise<void>;

  protected stateRefreshRequested = false;

  protected forceStateRefresh = false;

  protected operationalPublications = Promise.resolve();

  protected statePersistence = Promise.resolve();

  protected lastPublishedState?: string;

  protected polling = false;

  protected readonly pollingModbusOutputConnections = new Set<string>();

  protected heartbeatPublication?: Promise<void>;

  protected heartbeatRefreshRequested = false;

  protected credentialUpdates = Promise.resolve();

  protected credentialRotationSubscribed = false;

  protected sequence = 0;

  protected reservedSequence = 0;

  protected initialSequence = 0;

  protected readonly categorySequences = new Map<string, number>();

  protected readonly pendingFaults = new Set<string>();

  protected readonly modbusOutputSamples = new Map<
    string,
    { revision: number; value?: boolean; error?: string; acquiredAt: number; commanded: boolean | undefined }
  >();

  constructor(
    protected readonly options: {
      hardwareId: string;
      prefix: string;
      pairingCode: string;
      enrollmentSecret?: string;
      /** Docker config identity supplied by the root-owned launch transaction. */
      runtimeImageId?: string;
      store: StateStore;
      transport: Transport;
      device: DeviceAdapter;
      reconnectCredentials?: (credentials: DiscoveryClaim) => Promise<void>;
      /** Observes every evaluated readiness, including unchanged/unpublished ones. */
      onReadiness?: (readiness: { connected: boolean; configurationAccepted: boolean; ready: boolean }) => void;
    },
  ) {
    this.runtimeUpdateRequired = options.runtimeImageId !== undefined;
    if (options.runtimeImageId !== undefined && !/^sha256:[a-f0-9]{64}$/.test(options.runtimeImageId))
      throw new Error('Invalid runtime image identity');
    this.outputs = new OutputController({
      device: options.device,
      getSnapshot: () => this.state.accepted?.snapshot,
      getState: () => this.state,
      saveState: () => this.saveState(),
      publishState: () => this.requestStatePublication(),
      publishFault: (channelId, error) => this.publishFault(channelId, error),
      feedbackEnabled: () => !this.runtimeUpdateRequired && !this.runtimeFailsafePending,
    });
  }
  abstract start(activateConnectionHandling?: () => Promise<void>): Promise<void>;
  abstract receiveClaim(credentials: DiscoveryClaim): Promise<void>;
  abstract retryCredentialRotationSubscription(): Promise<void>;
  abstract receiveCredentialRotation(payload: Buffer): Promise<void>;
  protected abstract credentialRotationExpiry(input: Record<string, unknown>): number | undefined;
  abstract acknowledgeCredentialRotation(authenticated: DiscoveryClaim): Promise<void>;
  protected abstract credentialRotationTopic(): string;
  abstract receiveDiscoveryClaim(payload: Buffer): Promise<DiscoveryClaim | undefined>;
  abstract publishDiscoveryAnnouncement(sequence?: number): Promise<void>;
  abstract discoveryClaimTopic(): string;
  abstract receiveDesired(payload: Buffer): Promise<void>;
  abstract receiveCommand(payload: Buffer): Promise<void>;
  abstract setConnected(connected: boolean): Promise<void>;
  abstract publishHeartbeat(ignoreStatePublicationFailure?: boolean): Promise<void>;
  abstract publishMeasurements(): Promise<void>;
  abstract pollInputs(): Promise<void>;
  protected abstract requestStatePublication(): void;
  protected abstract publishState(force?: boolean): Promise<void>;
  abstract pollModbusOutputs(): Promise<void>;
  protected abstract readAndPublishState(force: boolean): Promise<void>;
  protected abstract publishReport(revision: number, contentHash: string, errors: ValidationError[]): Promise<void>;
  protected abstract reportRejected(revision: number, contentHash: string, errors: ValidationError[]): Promise<void>;
  protected abstract publishFault(channelId: string, error: unknown): Promise<void>;
  protected abstract acknowledge(
    id: string,
    status: 'accepted' | 'duplicate' | 'rejected',
    error?: string,
    code?: string,
  ): Promise<void>;
  protected abstract publishOperational(
    suffix: string,
    payload: Record<string, unknown>,
    options?: { retain?: boolean },
    isCurrent?: () => boolean,
    timestamp?: string,
  ): Promise<void>;
  protected abstract saveState(): Promise<void>;
  protected abstract queueStateUpdate(update: () => Promise<void>): Promise<void>;
  protected abstract topic(suffix: string): string;
  protected abstract discoveryTopic(): string;
  protected abstract desiredTopic(): string;
  protected abstract commandTopic(): string;
  protected abstract applyRuntimeUpdateFailsafe(): Promise<void>;
  protected abstract releaseFailedWrite(id: string, channelId: string): Promise<{ error: string; code: string }>;
  protected abstract releaseCommand(id: string): Promise<void>;
  protected abstract pruneCommandExpiries(): void;
  protected abstract runConfigurationUpdate<T>(operation: () => Promise<T>): Promise<T>;
}
