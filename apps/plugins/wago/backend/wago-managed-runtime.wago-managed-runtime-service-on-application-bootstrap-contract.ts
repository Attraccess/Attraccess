import type { RuntimeArtifactMetadata } from './wago-runtime-artifacts.contracts';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WagoManagedAccess } from './wago-managed-access.entity';
import type { BuildRuntimeArtifact } from './wago-build-runtime';
import type { RuntimeUpdateRecord } from './wago-runtime-update';
import type { RuntimeUpdateStore } from './wago-runtime-update';
import type { ManagedRuntimeUpdateHost } from './wago-runtime-update';
import type { RuntimeUpdateFailure } from './wago-runtime-update';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoController } from './wago-controller.entity';
import { Credentials } from './wago-managed-runtime.contracts';
import { RootAcceptance } from './wago-managed-runtime.contracts';
import { RootProbe } from './wago-managed-runtime.contracts';
import { LiveHeartbeat } from './wago-managed-runtime.contracts';
import { ManagementSetupReason } from './wago-managed-runtime.contracts';
import { ManagementSetup } from './wago-managed-runtime.contracts';

export abstract class WagoManagedRuntimeServiceOnApplicationBootstrapContract {
  abstract onApplicationBootstrap(): void;
  abstract registerRootProbe(probe: RootProbe): void;
  abstract registerPreparationAcceptance(accept: RootAcceptance): void;
  abstract registerRetirementProbe(probe: RootProbe): void;
  abstract bind(sessionId: number, controllerId: number): Promise<void>;
  abstract enrol(
    session: WagoCommissioningSession,
    execute: (script: string) => Promise<string>,
    signal: AbortSignal,
  ): Promise<void>;
  abstract status(controllerId: number): Promise<{
    physicalQualification: 'unverified';
    blocker?: RuntimeUpdateFailure | undefined;
    runtimeUpdateRequired?: boolean | undefined;
    runtime?:
      | {
          runningVersion: WagoController['runtimeVersion'];
          runningImageId: string | null;
          desiredVersion: RuntimeArtifactMetadata['manifest']['runtimeVersion'] | null;
          desiredImageId: RuntimeArtifactMetadata['imageId'] | null;
        }
      | undefined;
    managementSetup?: ManagementSetup | undefined;
    sessionId: number | null;
    management: string;
    keyFingerprint: string | null;
    update: RuntimeUpdateRecord | null;
    managementFailure?: string;
  }>;
  abstract sessionStatus(sessionId: number): Promise<{
    physicalQualification: 'unverified';
    blocker?: RuntimeUpdateFailure | undefined;
    runtimeUpdateRequired?: boolean | undefined;
    runtime?:
      | {
          runningVersion: WagoController['runtimeVersion'];
          runningImageId: string | null;
          desiredVersion: RuntimeArtifactMetadata['manifest']['runtimeVersion'] | null;
          desiredImageId: RuntimeArtifactMetadata['imageId'] | null;
        }
      | undefined;
    managementSetup?: ManagementSetup | undefined;
    sessionId: number | null;
    management: string;
    keyFingerprint: string | null;
    update: RuntimeUpdateRecord | null;
    managementFailure?: string;
  }>;
  protected abstract publicStatus(
    access: WagoManagedAccess | null,
    requestedControllerId?: number,
  ): Promise<{
    physicalQualification: 'unverified';
    blocker?: RuntimeUpdateFailure | undefined;
    runtimeUpdateRequired?: boolean | undefined;
    runtime?:
      | {
          runningVersion: WagoController['runtimeVersion'];
          runningImageId: string | null;
          desiredVersion: RuntimeArtifactMetadata['manifest']['runtimeVersion'] | null;
          desiredImageId: RuntimeArtifactMetadata['imageId'] | null;
        }
      | undefined;
    managementSetup?: ManagementSetup | undefined;
    sessionId: number | null;
    management: string;
    keyFingerprint: string | null;
    update: RuntimeUpdateRecord | null;
    managementFailure?: string;
  }>;
  abstract recoverPassword(sessionId: number, principal: PluginAuditPrincipal): Promise<{ password: string }>;
  abstract retire(controllerId: number): Promise<void>;
  abstract assertRemovable(controllerId: number): Promise<void>;
  protected abstract assertUpdateSettled(controllerId: number): Promise<void>;
  abstract assertNetworkSettled(controllerId: number | null, fingerprint?: string): Promise<void>;
  abstract networkManagement(
    controllerId: number,
    targetHost: string,
    signal: AbortSignal,
  ): Promise<{
    sessionId: number;
    fingerprint: string;
    hardwareId: string;
    managementToken: string;
    encryptedCredentials: string;
    command: (header: string, payload?: Buffer) => Promise<string>;
    prepare: () => Promise<void>;
  }>;
  abstract networkChanged(controllerId: number): void;
  abstract hasAccess(sessionId: number): Promise<boolean>;
  abstract commissioningRecoveryPassword(session: WagoCommissioningSession): Promise<string | null>;
  abstract restoreAccess(sessionId: number, principal: PluginAuditPrincipal): Promise<void>;
  abstract retryAccess(sessionId: number): Promise<void>;
  protected abstract setActiveState(
    sessionId: number,
    state: 'verified' | 'managed' | 'recovery_required',
  ): Promise<void>;
  abstract retryRuntime(controllerId: number): Promise<void>;
  protected abstract desired(): Promise<BuildRuntimeArtifact>;
  protected abstract loadSession(sessionId: number): Promise<WagoManagedAccess | null>;
  protected abstract required(controllerId: number): Promise<WagoManagedAccess>;
  protected abstract credentials(access: WagoManagedAccess): Credentials;
  protected abstract connection(
    access: WagoManagedAccess,
    header: string,
    signal?: AbortSignal,
    file?: string | Buffer,
    targetHost?: string,
  ): Promise<string>;
  protected abstract prove(access: WagoManagedAccess, signal?: AbortSignal): Promise<void>;
  protected abstract wake(): void;
  protected abstract refreshRuntimePolicy(id: number): Promise<LiveHeartbeat | undefined>;
  protected abstract reconcileConnection(id: number): Promise<void>;
  protected abstract scan(): Promise<void>;
  protected abstract enrolmentWaitReason(
    controller: WagoController,
    session: WagoCommissioningSession | null,
  ): Promise<ManagementSetupReason | null>;
  protected abstract completeEnrolment(controller: WagoController): Promise<boolean>;
  protected abstract finishSession(id: number): Promise<void>;
  protected abstract securityAudit(
    id: number,
    action: 'root_recovery' | 'security_apply' | 'security_recover',
    principal: PluginAuditPrincipal,
    operationId: string,
    outcome: 'attempted' | 'succeeded' | 'failed',
  ): Promise<void>;
  protected abstract updateStore(): RuntimeUpdateStore;
  protected abstract updateHost(): ManagedRuntimeUpdateHost;
  protected abstract auditUpdate(record: RuntimeUpdateRecord): Promise<void>;
  abstract onModuleDestroy(): Promise<void>;
}
