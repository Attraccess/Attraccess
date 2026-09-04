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
export interface CommissioningSession {
  id: number;
  hardwareId: string;
  mqttServerId: number;
  targetHost: string;
  hostKeyFingerprint: string;
  firmwareBaseline: string;
  state: string;
  enrollmentExpiresAt: string | null;
  pairingCode: string | null;
  codesysState: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommissioningSessionInput {
  hardwareId: string;
  targetHost: string;
  mqttServerId: number;
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

export const deliverCommissioningSession = (
  id: number,
  input: {
    hostKeyFingerprint: string;
    physicalIdentityConfirmed: boolean;
    codesysStopConfirmed: boolean;
    temporarySsh: { username: string; password: string };
  },
) => api.request<CommissioningSession>(`/commissioning/sessions/${id}/deliver`, { method: 'POST', body: input });
export const revokeCommissioningSession = (id: number) =>
  api.request<CommissioningSession>(`/commissioning/sessions/${id}/revoke`, { method: 'POST' });

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
