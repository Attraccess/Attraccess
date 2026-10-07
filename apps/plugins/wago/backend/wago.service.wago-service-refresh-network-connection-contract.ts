import { WagoConfigurationContract } from './wago-configuration-contract';
import { type WagoManualCommandAuditResult } from './wago-audit';
import type { PluginAuditPrincipal, PluginContext, PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './wago-controller.entity';
import { WagoSettings } from './wago-settings.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoControllerSummary } from './wago.service.wago-controller-summary';
import type { WagoService } from './wago.service';

export abstract class WagoServiceRefreshNetworkConnectionContract extends WagoConfigurationContract {
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
}
