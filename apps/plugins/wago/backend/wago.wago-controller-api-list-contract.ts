import type { WagoCredentialRotationService } from './wago-credential-rotation';
import { WAGO_PRESETS } from './configuration.state';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningService } from './wago-commissioning.service';
import type { WagoPresetApplication } from './configuration';
import type { WagoConfigurationSnapshot } from './configuration';
import type { ConfigurationEditorMetadata } from './configuration-editor';
import { CommissioningAttemptInput } from './wago.controller.commissioning-attempt-input';
import type { WagoControllerSummary } from './wago.service.wago-controller-summary';
import type { WagoSettings } from './wago-settings.entity';
import type { CommissioningSessionResponse } from './wago-commissioning.service.commissioning-session-response';
import type { ManagementPublicStatus } from './wago-management.types';
import type { WagoController } from './wago-controller.entity';
import type { WagoManualCommandAuditResult } from './wago-audit.contracts';
import type { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import type { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import type { ConfigurationDiff } from './configuration.configuration-diff';
import type { ConfigurationValidationError } from './configuration.contracts';
import type { configurationFlowImpacts } from './configuration-flow-references';
import type { configurationDiff } from './configuration.configuration-diff';

export abstract class WagoControllerApiListContract {
  abstract list(): Promise<WagoControllerSummary[]>;
  abstract settings(): Promise<WagoSettings>;
  abstract setSettings(body: {
    defaultMqttServerId?: number | null;
    operationalPrefix?: string;
  }): Promise<WagoSettings>;
  abstract commissioningSupport(): Promise<{ firmwareBaseline: string | null; ready: boolean }>;
  abstract commissioningSessions(limit?: string, offset?: string): Promise<CommissioningSessionResponse[]>;
  abstract createCommissioningSession(
    body: { mqttServerId?: number; targetHost?: string; name?: string },
    request?: AuthenticatedRequest,
  ): Promise<CommissioningSessionResponse>;
  abstract confirmCommissioningHostKey(
    id: number,
    body: {
      hostKeyFingerprint?: string;
      trustMethod?: 'trusted_inventory' | 'isolated_service_connection';
      physicalIdentityConfirmed?: boolean;
    },
  ): Promise<CommissioningSessionResponse>;
  abstract deliverCommissioningSession(
    id: number,
    body: CommissioningAttemptInput,
    request?: AuthenticatedRequest,
  ): Promise<CommissioningSessionResponse>;
  abstract recoverCommissioningSession(
    id: number,
    body: CommissioningAttemptInput,
    request: AuthenticatedRequest,
  ): Promise<CommissioningSessionResponse>;
  abstract commissioningVerification(id: number): ReturnType<WagoCommissioningService['verification']>;
  abstract managementStatus(id: number): Promise<ManagementPublicStatus | null>;
  abstract platformAction(
    id: number,
    action: string,
    body: Parameters<WagoCommissioningService['platform']>[2],
    request: AuthenticatedRequest,
  ): Promise<CommissioningSessionResponse>;
  abstract manageSecurity(
    id: number,
    action: string,
    body: Parameters<WagoCommissioningService['manageSecurity']>[2],
    request: AuthenticatedRequest,
  ): Promise<ManagementPublicStatus>;
  abstract revokeCommissioningSession(id: number): Promise<CommissioningSessionResponse>;
  abstract removeCommissioningSession(id: number): Promise<void>;
  abstract claim(
    id: number,
    body: { name?: string; verifier?: string; mqttServerId?: number },
    request: AuthenticatedRequest,
  ): Promise<WagoController>;
  abstract completeManualCredentials(
    id: number,
    body: { name?: string; verifier?: string; username?: string; password?: string },
    request: AuthenticatedRequest,
  ): Promise<{ controllerId: number; result: 'acknowledged' }>;
  abstract credentialRotationStatus(id: number): ReturnType<WagoCredentialRotationService['status']>;
  abstract rotateCredentials(
    id: number,
    body: { confirm?: boolean; retry?: boolean },
    request: AuthenticatedRequest,
  ): ReturnType<WagoCredentialRotationService['rotate']>;
  abstract manualCommand(
    id: number,
    body: Record<string, unknown>,
    request: AuthenticatedRequest,
  ): Promise<WagoManualCommandAuditResult>;
  abstract removeController(id: number, request: AuthenticatedRequest): Promise<void>;
  abstract draft(id: number): Promise<WagoConfigurationDraft | null>;
  abstract baseline(id: number): Promise<WagoConfigurationRevision | null>;
  abstract presets(): typeof WAGO_PRESETS;

  abstract previewPreset(
    id: number,
    body: { application?: WagoPresetApplication; snapshot?: WagoConfigurationSnapshot },
  ): Promise<{
    draftHash: string;
    snapshot: WagoConfigurationSnapshot;
    diff: ConfigurationDiff[];
    errors: ConfigurationValidationError[];
  }>;
  abstract applyPreset(
    id: number,
    body: {
      application?: WagoPresetApplication;
      selectedPaths?: string[];
      previewedDraftHash?: string;
      snapshot?: WagoConfigurationSnapshot;
    },
    request?: AuthenticatedRequest,
  ): Promise<Pick<WagoConfigurationDraft, 'snapshot'>>;
  abstract saveDraft(
    id: number,
    body: {
      snapshot?: unknown;
      metadata?: ConfigurationEditorMetadata;
      expectedDraft?: { snapshot: string; presetProvenance: string | null; updatedAt: string } | null;
    },
    request: AuthenticatedRequest,
  ): Promise<WagoConfigurationDraft>;
  abstract validateDraft(
    id: number,
    body?: { snapshot?: unknown },
  ): Promise<{ valid: boolean; errors: ConfigurationValidationError[] }>;
  abstract reviewDraft(id: number): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    draft: WagoConfigurationDraft;
    previous: WagoConfigurationRevision | null;
    changed: boolean;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }>;
  abstract revisions(
    id: number,
    offset?: string,
    limit?: string,
  ): Promise<{ revisions: Array<Omit<WagoConfigurationRevision, 'snapshot'>>; offset: number; limit: number }>;
  abstract publishDraft(
    id: number,
    request: AuthenticatedRequest,
    body?: { force?: boolean; reviewedHash?: string },
  ): Promise<WagoConfigurationRevision>;
  abstract rollback(
    id: number,
    revision: number,
    request: AuthenticatedRequest,
    body?: { force?: boolean; sourceHash?: string; currentHash?: string | null; draftHash?: string },
  ): Promise<WagoConfigurationRevision>;
  abstract acknowledgeRejection(
    id: number,
    revision: number,
    request: AuthenticatedRequest,
    body?: { contentHash?: string; reportedAt?: string },
  ): Promise<WagoConfigurationRevision>;
  abstract previewRevision(
    id: number,
    revision: number,
  ): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    revision: WagoConfigurationRevision;
    draftHash: string;
    current: WagoConfigurationRevision | null;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }>;
}
