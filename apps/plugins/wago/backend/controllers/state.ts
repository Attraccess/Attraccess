import { ConflictException, Inject } from '@nestjs/common';

import {
  PluginContext,
  PluginMqttSubscription,
  Repository,
  type PluginAuditPrincipal,
} from '@attraccess/plugins-backend-sdk';

import { WagoController } from './entity';

import { WagoSettings } from './settings.entity';

import { WagoEnrollment } from './enrollment.entity';

import { WagoConfigurationDraft } from '../configuration/draft.entity';

import { WagoConfigurationRevision } from '../configuration/revision.entity';

import { WagoCommandHandler } from '../commands/handler';

import { WagoDiagnosticsStore } from '../diagnostics/store';

import { PLUGIN_CONTEXT } from './model';

import { WagoControllerSummary } from './model';

import { type WagoManualCommandAuditResult, type WagoAuditLifecycle } from '../audit/index';

import { type WagoService } from './service';

import { WAGO_PRESETS } from '../configuration/model';

import {
  type WagoPresetApplication,
  type WagoConfigurationSnapshot,
  configurationDiff,
  type ConfigurationValidationError,
} from '../configuration/model';

import { type ConfigurationEditorMetadata } from '../configuration/editor';

import { configurationFlowImpacts } from '../configuration/flow-references';

import { type ConfigurationDiff } from '../configuration/model';

export abstract class WagoServiceState {
  constructor(@Inject(PLUGIN_CONTEXT) protected readonly context: PluginContext) {}

  readonly diagnostics = new WagoDiagnosticsStore();

  protected controllers!: Repository<WagoController>;

  protected readonly networkSubscriptions = new Map<number, PluginMqttSubscription[]>();

  protected networkSubscriptionRevision = 0;

  protected settings!: Repository<WagoSettings>;

  protected enrollments!: Repository<WagoEnrollment>;

  protected drafts!: Repository<WagoConfigurationDraft>;

  protected revisions!: Repository<WagoConfigurationRevision>;

  protected readonly subscriptions: PluginMqttSubscription[] = [];

  protected readonly enrollmentExpiryTimers = new Map<number, ReturnType<typeof setTimeout>>();

  protected readonly claimAcknowledgementSubscriptions = new Map<number, PluginMqttSubscription>();

  protected readonly claimLocks = new Map<number, Promise<void>>();

  protected readonly configurationLocks = new Map<number, Promise<void>>();

  protected readonly configurationReportQueues = new Map<
    number,
    { pending: Map<number, Buffer>; processing: boolean }
  >();

  protected commissioningDiscoveryHandler: ((controller: WagoController) => Promise<void>) | null = null;

  protected runtimeStatusHandler:
    | ((
        id: number,
        heartbeat: {
          imageId: string;
          runtimeVersion?: string;
          streamId: string;
          timestamp: number;
          receivedAt: number;
          sequence: number;
          runtimePolicyToken?: string;
        },
      ) => void)
    | null = null;

  protected readonly runtimePolicies = new Map<
    number,
    { desired: string; observed: string; runtimePolicyToken?: string }
  >();

  protected readonly runtimeUpdateBlocks = new Set<number>();

  protected readonly commands = new WagoCommandHandler({
    context: this.context,
    controllers: () => this.controllers,
    claimedController: async (id) => {
      const controller = await this.claimedController(id);
      if (this.isRuntimeUpdateRequired(id))
        throw new ConflictException(
          'Runtime update required; outputs are held in failsafe until the server runtime is installed',
        );
      return controller;
    },
    getSettings: () => this.getSettings(),
    appliedRevision: (id) => this.appliedRevision(id),
    onCommand: (controllerId, channelId, id) => this.diagnostics.command(controllerId, channelId, id),
    onCommandFailure: (id, status) => this.diagnostics.commandFailed(id, status),
  });

  protected claimConfigurationLock = Promise.resolve();

  protected subscriptionRebuild = Promise.resolve();

  protected subscriptionRetryTimer: ReturnType<typeof setTimeout> | null = null;

  protected activeSubscriptionGeneration = 0;

  protected destroyed = false;

  protected abstract connectivity(controller: WagoController): WagoControllerSummary['connectivity'];

  protected abstract appliedRevision(controllerId: number): Promise<WagoConfigurationRevision | null>;

  protected abstract matchesVerifier(controller: WagoController, verifier: string): boolean;

  protected abstract validEnrollment(
    secret: string,
    serverId: number,
    hardwareId: string,
  ): Promise<WagoEnrollment | null>;

  protected abstract activeEnrollment(id: number | null): Promise<WagoEnrollment | null>;

  protected abstract activeEnrollments(): Promise<WagoEnrollment[]>;

  protected abstract isActiveEnrollment(enrollment: WagoEnrollment): boolean;

  protected abstract scheduleEnrollmentExpiry(enrollment: WagoEnrollment, delay?: number): void;

  protected abstract revokeEnrollment(enrollment: WagoEnrollment, assertOwned?: () => Promise<void>): Promise<void>;

  protected abstract clearClaimAcknowledgement(enrollmentId: number): void;

  protected abstract withClaimLock<T>(id: number, operation: () => Promise<T>): Promise<T>;

  protected abstract withClaimConfigurationLock<T>(operation: () => Promise<T>): Promise<T>;

  protected abstract claimedController(id: number): Promise<WagoController>;

  protected abstract withConfigurationLock<T>(id: number, operation: () => Promise<T>): Promise<T>;

  protected abstract scheduleSubscriptionRetry(): void;

  abstract refreshNetworkConnection(controllerId: number): Promise<void>;

  abstract onApplicationBootstrap(): Promise<void>;

  abstract onModuleDestroy(): void;

  abstract commandSchema(
    config: Record<string, unknown>,
    resourceId: number,
    previewOnly?: boolean,
  ): Promise<Record<string, unknown>>;

  abstract validateCommandConfig(
    config: Record<string, unknown>,
    validationContext?: Map<string, unknown>,
  ): Promise<{ field: string; message: string; value?: unknown }[]>;

  abstract executeCommand(config: Record<string, unknown>): Promise<void>;

  abstract manualCommand(
    controllerId: number,
    input: Record<string, unknown>,
    principal: PluginAuditPrincipal,
  ): Promise<WagoManualCommandAuditResult>;

  abstract commandFailureBehavior(config: Record<string, unknown>): 'fail-flow' | 'failure-output' | 'log-and-continue';

  abstract commandFailureKind(
    error: unknown,
  ): 'transport-dispatch' | 'acknowledgement-timeout' | 'controller-rejection' | 'node-failure';

  abstract list(): Promise<WagoControllerSummary[]>;

  abstract registerCommissioningDiscoveryHandler(handler: (controller: WagoController) => Promise<void>): void;

  abstract registerRuntimeStatusHandler(handler: NonNullable<WagoService['runtimeStatusHandler']>): void;

  abstract isRuntimeUpdateRequired(controllerId: number): boolean;

  abstract blockRuntime(controllerId: number): void;

  abstract setRuntimePolicy(
    controllerId: number,
    desired: string,
    observed: string,
    runtimePolicyToken?: string,
  ): Promise<void>;

  abstract getSettings(): Promise<WagoSettings>;

  abstract setSettings(serverId?: number | null, operationalPrefix?: string): Promise<WagoSettings>;

  abstract setDefaultMqttServer(serverId: number | null): Promise<WagoSettings>;

  abstract createEnrollment(
    hardwareId: string,
    mqttServerId?: number,
    manualCredentials?: { username: string; password: string },
    assertOwned?: () => Promise<void>,
  ): Promise<{
    id: number;
    broker: { host: string; port: number; useTls: boolean };
    username: string;
    password?: string;
    claimSecret: string;
    expiresAt: string;
    manualInstructions?: readonly string[];
  }>;

  abstract revokeEnrollmentById(id: number, assertOwned?: () => Promise<void>): Promise<void>;

  abstract deleteEnrollmentById(id: number, assertOwned?: () => Promise<void>): Promise<void>;

  abstract remove(id: number, assertOwned?: () => Promise<void>): Promise<string>;

  abstract completeManualCredentials(
    id: number,
    input: { name: string; verifier: string; username: string; password: string },
    principal: PluginAuditPrincipal,
    assertOwned?: () => Promise<void>,
  ): Promise<{ controllerId: number; result: 'acknowledged' }>;

  abstract claim(
    id: number,
    name: string,
    verifier: string,
    mqttServerId?: number,
    assertOwned?: () => Promise<void>,
    manual?: {
      credentials: { username: string; password: string };
      acknowledged: () => void;
      expiresAt: string;
      dispatched: () => void;
    },
  ): Promise<WagoController>;

  protected abstract prepareClaim(
    id: number,
    name: string,
    verifier: string,
    mqttServerId?: number,
    assertOwned?: () => Promise<void>,
    manualCredentials?: { username: string; password: string },
  ): Promise<{
    controller: WagoController;
    enrollment: WagoEnrollment;
    mqttServerId: number;
    credential: { username: string; password: string };
    configuration: { protocolVersion: number; namespace: string; desiredTopic: string; reportedTopic: string };
    identity: string;
    previousController: Pick<WagoController, 'trustState' | 'name' | 'mqttServerId' | 'updatedAt'>;
    credentialDelivered: boolean;
  }>;

  protected abstract restoreUnclaimedController(
    {
      controller,
      mqttServerId,
      identity,
      previousController,
    }: {
      controller: WagoController;
      mqttServerId: number;
      identity: string;
      previousController: Pick<WagoController, 'trustState' | 'name' | 'mqttServerId' | 'updatedAt'>;
    },
    assertOwned?: () => Promise<void>,
  ): Promise<void>;

  protected abstract restoreUnclaimedControllerWhileLocked(
    {
      controller,
      mqttServerId,
      identity,
      previousController,
    }: {
      controller: WagoController;
      mqttServerId: number;
      identity: string;
      previousController: Pick<WagoController, 'trustState' | 'name' | 'mqttServerId' | 'updatedAt'>;
    },
    assertOwned?: () => Promise<void>,
  ): Promise<void>;

  protected abstract subscribeConfiguredServers(): Promise<void>;

  protected abstract rebuildSubscriptions(): Promise<void>;

  protected abstract unsubscribe(): void;

  protected abstract subscribeMqtt(
    ...args: Parameters<PluginContext['mqtt']['subscribe']>
  ): Promise<PluginMqttSubscription>;

  protected abstract isActiveSubscriptionGeneration(generation: number): boolean;

  protected abstract onDiscovery(serverId: number, topic: string, payload: Buffer): Promise<void>;

  protected abstract onHeartbeat(hardwareId: string, payload: Buffer): Promise<void>;

  protected abstract watchClaimAcknowledgement(
    prepared: {
      controller: WagoController;
      enrollment: WagoEnrollment;
      mqttServerId: number;
      credentialDelivered?: boolean;
    },
    acknowledgementToken: string,
    manual?: { acknowledged: () => void; assertOwned: () => Promise<void> },
  ): Promise<void>;

  protected abstract onConfigurationReported(controllerId: number, payload: Buffer): Promise<void>;

  protected abstract onCommandAcknowledgement(controllerId: number, payload: Buffer): void;

  protected abstract enqueueConfigurationReport(controllerId: number, payload: Buffer): void;

  protected abstract processConfigurationReports(
    controllerId: number,
    payload: Buffer,
    queue: { pending: Map<number, Buffer>; processing: boolean },
  ): Promise<void>;

  protected abstract configurationReportRevision(payload: Buffer): number | null;

  protected abstract publishRevision(
    controller: WagoController,
    revision: WagoConfigurationRevision,
  ): Promise<WagoConfigurationRevision>;

  abstract getDraft(controllerId: number): Promise<WagoConfigurationDraft | null>;

  abstract getConfigurationBaseline(controllerId: number): Promise<WagoConfigurationRevision | null>;

  abstract saveDraft(
    controllerId: number,
    snapshot: unknown,
    metadata?: ConfigurationEditorMetadata,
    principal?: PluginAuditPrincipal,
    expectedDraft?: Pick<WagoConfigurationDraft, 'snapshot' | 'presetProvenance' | 'updatedAt'> | null,
  ): Promise<WagoConfigurationDraft>;

  abstract presets(): typeof WAGO_PRESETS;

  abstract previewPreset(
    controllerId: number,
    application: WagoPresetApplication,
    snapshot?: WagoConfigurationSnapshot,
  ): Promise<{
    draftHash: string;
    snapshot: WagoConfigurationSnapshot;
    diff: ConfigurationDiff[];
    errors: ConfigurationValidationError[];
  }>;

  abstract validateDraft(
    controllerId: number,
    snapshot?: unknown,
  ): Promise<{ valid: boolean; errors: ConfigurationValidationError[] }>;

  protected abstract draftForPreset(controllerId: number): Promise<WagoConfigurationDraft>;

  abstract applyPreset(
    controllerId: number,
    application: WagoPresetApplication,
    selectedPaths: string[],
    previewedDraftHash: string,
    snapshotOrPrincipal?: WagoConfigurationSnapshot | PluginAuditPrincipal,
    principal?: PluginAuditPrincipal,
  ): Promise<Pick<WagoConfigurationDraft, 'snapshot'>>;

  abstract revisionsFor(
    controllerId: number,
    offset?: number,
    limit?: number,
  ): Promise<{ revisions: Array<Omit<WagoConfigurationRevision, 'snapshot'>>; offset: number; limit: number }>;

  abstract reviewDraft(controllerId: number): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    draft: WagoConfigurationDraft;
    previous: WagoConfigurationRevision | null;
    changed: boolean;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }>;

  abstract publishDraft(
    controllerId: number,
    force?: boolean,
    reviewedHash?: string,
    principal?: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision>;

  abstract rollback(
    controllerId: number,
    revision: number,
    force?: boolean,
    sourceHash?: string,
    currentHash?: string | null,
    draftHash?: string,
    principal?: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision>;

  abstract acknowledgeRejection(
    controllerId: number,
    revision: number,
    expected: { contentHash?: string; reportedAt?: string },
    principal: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision>;

  abstract previewRevision(
    controllerId: number,
    revision: number,
  ): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    revision: WagoConfigurationRevision;
    draftHash: string;
    current: WagoConfigurationRevision | null;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }>;

  protected abstract revisionIdentity(revision: WagoConfigurationRevision | null): unknown;

  protected abstract impactIdentity(impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>): unknown;

  protected abstract reviewIdentity(
    draft: WagoConfigurationDraft,
    current: WagoConfigurationRevision | null,
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>,
  ): string;

  protected abstract rollbackIdentity(
    draft: WagoConfigurationDraft | null,
    current: WagoConfigurationRevision | null,
    source: WagoConfigurationRevision,
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>,
  ): string;

  protected abstract draftIdentity(draft: WagoConfigurationDraft | null): string;

  protected abstract metadataFromProvenance(provenance: string | null | undefined): ConfigurationEditorMetadata;

  protected abstract saveDraftWhileLocked(
    controllerId: number,
    snapshot: unknown,
    metadata?: ConfigurationEditorMetadata,
  ): Promise<WagoConfigurationDraft>;

  protected abstract reviewDraftWhileLocked(controllerId: number): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    draft: WagoConfigurationDraft;
    previous: WagoConfigurationRevision | null;
    changed: boolean;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }>;

  protected abstract requireConfigurationCompatibility(controller: WagoController): void;

  protected abstract publishDraftWhileLocked(
    controllerId: number,
    force?: boolean,
    reviewedHash?: string,
    principal?: PluginAuditPrincipal,
    preparedDraft?: WagoConfigurationDraft,
    onAllocated?: (revision: number) => void,
  ): Promise<WagoConfigurationRevision>;

  protected abstract auditRevision(
    lifecycle: WagoAuditLifecycle | undefined,
    operation: () => Promise<WagoConfigurationRevision>,
    allocated: () => number | undefined,
  ): Promise<WagoConfigurationRevision>;

  protected abstract latestRevision(controllerId: number): Promise<WagoConfigurationRevision | null>;
}
