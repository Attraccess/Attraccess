import type { WagoCommissioningState } from './api.wago-commissioning-state.contracts';
import type { WagoConfigurationDraft } from './api.wago-commissioning-state.contracts';
import type { WagoConfigurationSnapshot } from '../../backend/configuration';
import type { ConfigurationValidationError } from '../../backend/configuration';
export interface ClaimControllerInput {
  name: string;
  verifier: string;
  mqttServerId?: number;
}

export interface CommissioningSession {
  operationDeadlineAt?: string | null;
  runtimeRecoveryAvailable?: boolean;
  managedAccessAvailable?: boolean;
  managementControllerId?: number | null;
  dockerProvisionState?: string | null;
  platformReport?: string | null;
  runtimeArtifactDigest?: string | null;
  id: number;
  hardwareId: string;
  mqttServerId: number;
  targetHost: string;
  controllerName: string | null;
  hostKeyFingerprint: string;
  firmwareBaseline: string;
  state: WagoCommissioningState;
  enrollmentExpiresAt: string | null;
  codesysState: string | null;
  progressPercent: number | null;
  progressStep: string | null;
  progressDetail: string | null;
  auditLog: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CommissioningSupport {
  firmwareBaseline: string | null;
  ready: boolean;
}
export interface CommissioningVerification {
  controllerId: number | null;
  permanentConnection: boolean;
  enrollmentRevoked: boolean;
  configurationApplied: boolean;
  managementHardening: 'unverified' | 'verified' | 'supported' | 'UNSUPPORTED' | 'qualification_required';
  softwareReady: boolean;
  hardwareReadiness: 'unverified' | 'stale' | 'ready' | 'not_ready';
  physicalQualification: 'required';
  ready: false;
}
export interface ConfigurationDiff {
  path: string;
  previous: unknown;
  current: unknown;
}
export interface ConfigurationImpact {
  channelId: string;
  message: string;
  references: Array<{ resourceId: number; nodeId: string; nodeType: string }>;
}
export interface ConfigurationRevision {
  presetProvenance?: string | null;
  revision: number;
  contentHash: string;
  state: 'pending' | 'published' | 'applied' | 'rejected';
  rejectionErrors: string | null;
  rejectionAcknowledgedAt?: string | null;
  rejectionAcknowledgedBy?: number | null;
  publishedAt: string;
  reportedAt: string | null;
}

export interface ConfigurationReview {
  draft: WagoConfigurationDraft;
  previous: (ConfigurationRevision & { snapshot: string }) | null;
  changed: boolean;
  diff: ConfigurationDiff[];
  impacts: ConfigurationImpact[];
  metadataDiff?: ConfigurationDiff[];
}
export interface CreateCommissioningSessionInput {
  targetHost: string;
  mqttServerId: number;
  name: string;
}

export type DraftIdentity = Pick<WagoConfigurationDraft, 'snapshot' | 'presetProvenance' | 'updatedAt'>;
export interface MqttServer {
  id: number;
  name: string;
  host: string;
  port: number;
  useTls: boolean;
}
export interface NetworkChangeStatus {
  available: boolean;
  targetHost: string | null;
  mqttServerId: number | null;
  pendingCredentialRetirements: number;
  operation: {
    targetHost: string;
    mqttServerId: number | null;
    phase: 'connecting' | 'provisioning' | 'applying' | 'verifying' | 'saving' | 'completed';
    failure: string | null;
    running: boolean;
  } | null;
}

export interface PresetPreview {
  draftHash: string;
  diff: ConfigurationDiff[];
  snapshot: WagoConfigurationSnapshot;
  errors: ConfigurationValidationError[];
}

export interface RevisionPreview {
  draftHash: string;
  revision: ConfigurationRevision & { snapshot: string };
  current: (ConfigurationRevision & { snapshot: string }) | null;
  diff: ConfigurationDiff[];
  impacts: ConfigurationImpact[];
  metadataDiff?: ConfigurationDiff[];
}
export interface RuntimeUpdateStatus {
  managementFailure?: string;
  managementSetup?: { state: 'waiting' | 'running'; reason: string };
  runtime?: {
    runningVersion: string;
    runningImageId: string | null;
    desiredVersion: string | null;
    desiredImageId: string | null;
  };
  blocker?: string;
  runtimeUpdateRequired?: boolean;
  sessionId: number | null;
  management: 'pending' | 'verified' | 'managed' | 'recovery_required' | 'retiring' | 'retired' | 'reenrol_required';
  keyFingerprint: string | null;
  physicalQualification: 'unverified';
  update: {
    phase:
      | 'blocked'
      | 'preparing'
      | 'staging'
      | 'activating'
      | 'verifying'
      | 'accepting'
      | 'recovering'
      | 'recovery_required'
      | 'failed'
      | 'current';
    desiredImageId: string;
    desiredRuntimeVersion?: string;
    previousRuntimeVersion?: string | null;
    previousImageId: string | null;
    buildId: string;
    attempt: number;
    failure: string | null;
    storageDiagnostics?: { path: string; requiredKiB: number; availableKiB: number }[];
    retryAt: number;
    cleanupAttempt?: number;
    cleanupRetryAt?: number;
  } | null;
}
