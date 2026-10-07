import type { ConfigurationRevision } from './api.claim-controller-input.contracts';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import type { WagoConfigurationSnapshot } from '../../backend/configuration';
import type { WagoPresetApplication } from './api.wago-commissioning-state.contracts';
import type { WagoConfigurationDraft } from './api.wago-commissioning-state.contracts';
import type { NetworkChangeStatus } from './api.claim-controller-input.contracts';
import type { ClaimControllerInput } from './api.claim-controller-input.contracts';
import type { WagoController } from './api.wago-commissioning-state.contracts';
import type { CommissioningSession } from './api.claim-controller-input.contracts';
import type { CreateCommissioningSessionInput } from './api.claim-controller-input.contracts';
import type { CommissioningSupport } from './api.claim-controller-input.contracts';
import type { CommissioningVerification } from './api.claim-controller-input.contracts';
import type { RuntimeUpdateStatus } from './api.claim-controller-input.contracts';
import type { WagoSettings } from './api.wago-commissioning-state.contracts';
import type { MqttServer } from './api.claim-controller-input.contracts';
import type { WagoPreset } from './api.wago-commissioning-state.contracts';
import type { RevisionPreview } from './api.claim-controller-input.contracts';
import type { PresetPreview } from './api.claim-controller-input.contracts';

export const api = createPluginApiClient('/api/wago');

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

export const applyPreset = (
  id: number,
  application: WagoPresetApplication,
  selectedPaths: string[],
  previewedDraftHash: string,
  snapshot: WagoConfigurationSnapshot,
) =>
  api.request<WagoConfigurationDraft>(`/controllers/${id}/configuration/presets/apply`, {
    method: 'POST',
    body: { application, selectedPaths, previewedDraftHash, snapshot },
  });

export const changeControllerNetwork = (id: number, input: { targetHost: string; mqttServerId: number | null }) =>
  api.request<NetworkChangeStatus>(`/controllers/${id}/network-change`, { method: 'POST', body: input });

export const claimController = (id: number, input: ClaimControllerInput) =>
  api.request<WagoController>(`/controllers/${id}/claim`, { method: 'POST', body: input });

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

export const createCommissioningSession = (input: CreateCommissioningSessionInput) =>
  api.request<CommissioningSession>('/commissioning/sessions', { method: 'POST', body: input });

export const deliverCommissioningSession = (
  id: number,
  input: { confirmInstall: true; temporarySsh: { username: string; password: string } },
) => api.request<CommissioningSession>(`/commissioning/sessions/${id}/deliver`, { method: 'POST', body: input });

export const getCommissioningSupport = () => api.request<CommissioningSupport>('/commissioning/support');

export const getCommissioningVerification = (id: number) =>
  api.request<CommissioningVerification>(`/commissioning/sessions/${id}/verification`);

export const getConfigurationBaseline = (id: number) =>
  api.request<(ConfigurationRevision & { snapshot: string }) | null>(`/controllers/${id}/configuration/baseline`);

export const getDraft = (id: number) =>
  api.request<WagoConfigurationDraft | null>(`/controllers/${id}/configuration/draft`);

export const getManagedAccessStatus = (id: number) =>
  api.request<RuntimeUpdateStatus>(`/commissioning/sessions/${id}/managed-access`);

export const getNetworkChangeStatus = (id: number) =>
  api.request<NetworkChangeStatus>(`/controllers/${id}/network-change`);

export const getRootRecoveryPassword = (sessionId: number) =>
  api.request<{ password: string }>(`/commissioning/sessions/${sessionId}/root-recovery`, {
    method: 'POST',
    body: { confirm: true },
  });

export const getRuntimeUpdateStatus = (id: number) =>
  api.request<RuntimeUpdateStatus>(`/controllers/${id}/runtime-update`);

export const getSettings = () => api.request<WagoSettings>('/settings');

export const hostApi = createPluginApiClient('/api');

export const listCommissioningSessions = (limit = 100, offset = 0, signal?: AbortSignal) =>
  api.request<CommissioningSession[]>(`/commissioning/sessions?limit=${limit}&offset=${offset}`, { signal });

export const listConfigurationRevisions = (id: number, offset: number) =>
  api.request<{ revisions: ConfigurationRevision[]; offset: number; limit: number }>(
    `/controllers/${id}/configuration/revisions?offset=${offset}&limit=20`,
  );

export const listControllers = () => api.request<WagoController[]>('/controllers');

export const listMqttServers = () => hostApi.request<MqttServer[]>('/mqtt/servers');

export const listPresets = () => api.request<WagoPreset[]>('/configuration/presets');

export const previewConfigurationRevision = (id: number, revision: number) =>
  api.request<RevisionPreview>(`/controllers/${id}/configuration/revisions/${revision}/preview`);

export const previewPreset = (id: number, application: WagoPresetApplication, snapshot?: WagoConfigurationSnapshot) =>
  api.request<PresetPreview>(`/controllers/${id}/configuration/presets/preview`, {
    method: 'POST',
    body: { application, snapshot },
  });

export const publishConfiguration = (id: number, force: boolean, reviewedHash: string) =>
  api.request<ConfigurationRevision>(`/controllers/${id}/configuration/publish`, {
    method: 'POST',
    body: { force, reviewedHash },
  });

export const recoverCommissioningSession = (id: number, input: Parameters<typeof deliverCommissioningSession>[1]) =>
  api.request<CommissioningSession>(`/commissioning/sessions/${id}/recover`, { method: 'POST', body: input });

export const removeCommissioningSession = (id: number) =>
  api.request<void>(`/commissioning/sessions/${id}`, { method: 'DELETE' });

export const removeController = (id: number) => api.request<void>(`/controllers/${id}`, { method: 'DELETE' });
