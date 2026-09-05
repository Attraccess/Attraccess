import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';

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
  targetHost: string;
  mqttServerId: number;
  name: string;
}
export interface WagoConfigurationDraft {
  controllerId: number;
  snapshot: string;
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

export const confirmCommissioningHostKey = (id: number, hostKeyFingerprint: string) =>
  api.request<CommissioningSession>(`/commissioning/sessions/${id}/confirm-host-key`, { method: 'POST', body: { hostKeyFingerprint } });

export const listCommissioningSessions = (limit = 100, offset = 0) =>
  api.request<CommissioningSession[]>(`/commissioning/sessions?limit=${limit}&offset=${offset}`);

export interface CommissioningVerification {
  permanentConnection: boolean;
  enrollmentRevoked: boolean;
  configurationApplied: boolean;
  managementHardening: 'unverified';
  hardwareReadiness: 'unverified';
  ready: false;
}

export const getCommissioningVerification = (id: number) =>
  api.request<CommissioningVerification>(`/commissioning/sessions/${id}/verification`);

export const deliverCommissioningSession = (
  id: number,
  input: { confirmInstall: true; temporarySsh: { username: string; password: string } },
) => api.request<CommissioningSession>(`/commissioning/sessions/${id}/deliver`, { method: 'POST', body: input });
export const recoverCommissioningSession = (
  id: number,
  input: Parameters<typeof deliverCommissioningSession>[1],
) => api.request<CommissioningSession>(`/commissioning/sessions/${id}/recover`, { method: 'POST', body: input });
export const revokeCommissioningSession = (id: number) =>
  api.request<CommissioningSession>(`/commissioning/sessions/${id}/revoke`, { method: 'POST' });
export const removeCommissioningSession = (id: number) =>
  api.request<void>(`/commissioning/sessions/${id}`, { method: 'DELETE' });
export const removeController = (id: number) => api.request<void>(`/controllers/${id}`, { method: 'DELETE' });

export const getDraft = (id: number) =>
  api.request<WagoConfigurationDraft | null>(`/controllers/${id}/configuration/draft`);
export const saveDraft = (id: number, snapshot: unknown) =>
  api.request<WagoConfigurationDraft>(`/controllers/${id}/configuration/draft`, { method: 'POST', body: { snapshot } });
export const listPresets = () => api.request<WagoPreset[]>('/configuration/presets');
export const previewPreset = (id: number, application: WagoPresetApplication) =>
  api.request<PresetPreview>(`/controllers/${id}/configuration/presets/preview`, {
    method: 'POST',
    body: { application },
  });
export const applyPreset = (
  id: number,
  application: WagoPresetApplication,
  selectedPaths: string[],
  previewedDraftHash: string,
) =>
  api.request<WagoConfigurationDraft>(`/controllers/${id}/configuration/presets/apply`, {
    method: 'POST',
    body: { application, selectedPaths, previewedDraftHash },
  });
