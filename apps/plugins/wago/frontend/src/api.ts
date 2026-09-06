import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import type { WagoConfigurationSnapshot, ConfigurationValidationError } from '../../backend/configuration';
import type { ConfigurationEditorMetadata } from '../../backend/configuration-editor';
export type { WagoConfigurationSnapshot, ConfigurationValidationError, ConfigurationEditorMetadata };

export interface WagoController {
  id: number;
  hardwareId: string;
  trustState: 'untrusted' | 'claimed';
  name: string | null;
  mqttServerId: number | null;
  protocolVersion: string;
  runtimeVersion: string;
  capabilities: string;
  lastSequence: number;
  lastHeartbeatAt: string | null;
  lastSeenAt: string;
  compatibilityError: string | null;
  connectivity: 'online' | 'stale' | 'untrusted';
}
export interface WagoSettings {
  defaultMqttServerId: number | null;
}

export interface MqttServer {
  id: number;
  name: string;
  host: string;
  port: number;
  useTls: boolean;
}

export interface ClaimControllerInput {
  name: string;
  verifier: string;
  mqttServerId?: number;
}
export type WagoCommissioningState =
  | 'awaiting_delivery'
  | 'delivering'
  | 'awaiting_identity_confirmation'
  | 'awaiting_codesys_confirmation'
  | 'delivery_failed'
  | 'awaiting_discovery'
  | 'awaiting_claim'
  | 'completed'
  | 'awaiting_verification'
  | 'claim_interrupted'
  | 'recovery_revocation_pending'
  | 'revoked';
export interface CommissioningSession {
  runtimeRecoveryAvailable?: boolean;
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

export interface CreateCommissioningSessionInput {
  runtimeArtifactDigest?: string;
  targetHost: string;
  mqttServerId: number;
  name: string;
}
export interface WagoConfigurationDraft {
  controllerId: number;
  snapshot: string;
  /** Opaque review identity covering the saved snapshot and editor metadata, not the runtime contentHash. */
  reviewedHash: string | null;
  presetProvenance: string | null;
  updatedAt: string;
}
export interface WagoPreset {
  id:
    | 'metered-switched-load'
    | 'pulsed-lock-bank'
    | 'guarded-enable-request'
    | 'generic-digital-output'
    | 'generic-monitored-input';
  name: string;
  description: string;
}
export interface WagoPresetApplication {
  presetId: WagoPreset['id'];
  channelId: string;
  physicalPointId: string;
  guardChannelId?: string;
  feedbackChannelId?: string;
}
export interface ConfigurationDiff {
  path: string;
  previous: unknown;
  current: unknown;
}
export interface PresetPreview {
  draftHash: string;
  diff: ConfigurationDiff[];
  snapshot: WagoConfigurationSnapshot;
  errors: ConfigurationValidationError[];
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
export interface ConfigurationImpact {
  channelId: string;
  message: string;
  references: Array<{ resourceId: number; nodeId: string; nodeType: string }>;
}
export interface ConfigurationReview {
  draft: WagoConfigurationDraft;
  previous: (ConfigurationRevision & { snapshot: string }) | null;
  changed: boolean;
  diff: ConfigurationDiff[];
  metadataDiff: ConfigurationDiff[];
  impacts: ConfigurationImpact[];
}
export interface RevisionPreview {
  draftHash: string;
  revision: ConfigurationRevision & { snapshot: string };
  current: (ConfigurationRevision & { snapshot: string }) | null;
  diff: ConfigurationDiff[];
  metadataDiff: ConfigurationDiff[];
  impacts: ConfigurationImpact[];
}

const api = createPluginApiClient('/api/wago');
const hostApi = createPluginApiClient('/api');

export const listControllers = () => api.request<WagoController[]>('/controllers');

export const getSettings = () => api.request<WagoSettings>('/settings');

export const setSettings = (defaultMqttServerId: number | null) =>
  api.request<WagoSettings>('/settings', { method: 'POST', body: { defaultMqttServerId } });

export const listMqttServers = () => hostApi.request<MqttServer[]>('/mqtt/servers');

export const claimController = (id: number, input: ClaimControllerInput) =>
  api.request<WagoController>(`/controllers/${id}/claim`, { method: 'POST', body: input });

export const createCommissioningSession = (input: CreateCommissioningSessionInput) =>
  api.request<CommissioningSession>('/commissioning/sessions', { method: 'POST', body: input });

export const getCommissioningSupport = () =>
  api.request<{ ready: boolean; firmwareBaseline: string | null }>('/commissioning/support');

export const confirmCommissioningHostKey = (
  id: number,
  hostKeyFingerprint: string,
  physicalIdentityConfirmed = false,
) =>
  api.request<CommissioningSession>(`/commissioning/sessions/${id}/confirm-host-key`, {
    method: 'POST',
    body: {
      hostKeyFingerprint,
      physicalIdentityConfirmed,
      trustMethod: physicalIdentityConfirmed ? 'isolated_service_connection' : 'trusted_inventory',
    },
  });

export const listCommissioningSessions = (limit = 100, offset = 0) =>
  api.request<CommissioningSession[]>(`/commissioning/sessions?limit=${limit}&offset=${offset}`);

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

export const getCommissioningVerification = (id: number) =>
  api.request<CommissioningVerification>(`/commissioning/sessions/${id}/verification`);

export const deliverCommissioningSession = (
  id: number,
  input: { confirmInstall: true; temporarySsh: { username: string; password: string } },
) => api.request<CommissioningSession>(`/commissioning/sessions/${id}/deliver`, { method: 'POST', body: input });
export const recoverCommissioningSession = (id: number, input: Parameters<typeof deliverCommissioningSession>[1]) =>
  api.request<CommissioningSession>(`/commissioning/sessions/${id}/recover`, { method: 'POST', body: input });
export const revokeCommissioningSession = (id: number) =>
  api.request<CommissioningSession>(`/commissioning/sessions/${id}/revoke`, { method: 'POST' });
export const removeCommissioningSession = (id: number) =>
  api.request<void>(`/commissioning/sessions/${id}`, { method: 'DELETE' });
export const removeController = (id: number) => api.request<void>(`/controllers/${id}`, { method: 'DELETE' });

export const getDraft = (id: number) =>
  api.request<WagoConfigurationDraft | null>(`/controllers/${id}/configuration/draft`);
export const saveDraft = (id: number, snapshot: unknown, metadata?: ConfigurationEditorMetadata) =>
  api.request<WagoConfigurationDraft>(`/controllers/${id}/configuration/draft`, {
    method: 'POST',
    body: { snapshot, metadata },
  });
export const listPresets = () => api.request<WagoPreset[]>('/configuration/presets');
export const previewPreset = (id: number, application: WagoPresetApplication, snapshot?: WagoConfigurationSnapshot) =>
  api.request<PresetPreview>(`/controllers/${id}/configuration/presets/preview`, {
    method: 'POST',
    body: { application, snapshot },
  });
export const applyPreset = (
  id: number,
  application: WagoPresetApplication,
  selectedPaths: string[],
  previewedDraftHash: string,
  snapshot?: WagoConfigurationSnapshot,
) =>
  api.request<Pick<WagoConfigurationDraft, 'snapshot'>>(`/controllers/${id}/configuration/presets/apply`, {
    method: 'POST',
    body: { application, selectedPaths, previewedDraftHash, snapshot },
  });

export const validateConfiguration = (id: number, snapshot: WagoConfigurationSnapshot) =>
  api.request<{ valid: boolean; errors: ConfigurationValidationError[] }>(`/controllers/${id}/configuration/validate`, {
    method: 'POST',
    body: { snapshot },
  });
export const reviewConfiguration = (id: number) =>
  api.request<ConfigurationReview>(`/controllers/${id}/configuration/review`, { method: 'POST' });
export const publishConfiguration = (id: number, force: boolean, reviewedHash: string) =>
  api.request<ConfigurationRevision>(`/controllers/${id}/configuration/publish`, {
    method: 'POST',
    body: { force, reviewedHash },
  });
export const listConfigurationRevisions = (id: number, offset: number) =>
  api.request<{ revisions: ConfigurationRevision[]; offset: number; limit: number }>(
    `/controllers/${id}/configuration/revisions?offset=${offset}&limit=20`,
  );
export const previewConfigurationRevision = (id: number, revision: number) =>
  api.request<RevisionPreview>(`/controllers/${id}/configuration/revisions/${revision}/preview`);
export const rollbackConfiguration = (
  id: number,
  revision: number,
  force: boolean,
  sourceHash: string,
  currentHash: string | null,
  draftHash: string,
) =>
  api.request<ConfigurationRevision>(`/controllers/${id}/configuration/rollback/${revision}`, {
    method: 'POST',
    body: { force, sourceHash, currentHash, draftHash },
  });

export const acknowledgeConfigurationRejection = (
  id: number,
  revision: number,
  contentHash: string,
  reportedAt: string,
) =>
  api.request<ConfigurationRevision>(`/controllers/${id}/configuration/revisions/${revision}/acknowledge-rejection`, {
    method: 'POST',
    body: { contentHash, reportedAt },
  });
