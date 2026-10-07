import { api } from './api.acknowledge-configuration-rejection.state';
import type { NetworkChangeStatus } from './api.claim-controller-input.contracts';
import type { ConfigurationReview } from './api.claim-controller-input.contracts';
import type { CommissioningSession } from './api.claim-controller-input.contracts';
import type { ConfigurationRevision } from './api.claim-controller-input.contracts';
import type { ConfigurationEditorMetadata } from '../../backend/configuration-editor';
import type { DraftIdentity } from './api.claim-controller-input.contracts';
import type { WagoConfigurationDraft } from './api.wago-commissioning-state.contracts';
import type { WagoSettings } from './api.wago-commissioning-state.contracts';
import type { WagoConfigurationSnapshot } from '../../backend/configuration';
import type { ConfigurationValidationError } from '../../backend/configuration';

export const restoreManagedAccess = (sessionId: number) =>
  api.request<void>(`/commissioning/sessions/${sessionId}/managed-access/restore`, {
    method: 'POST',
    body: { confirm: true },
  });

export const retirePreviousMqttCredentials = (id: number) =>
  api.request<NetworkChangeStatus>(`/controllers/${id}/network-change/retire-credentials`, { method: 'POST' });

export const retryControllerNetworkChange = (id: number) =>
  api.request<NetworkChangeStatus>(`/controllers/${id}/network-change/retry`, { method: 'POST' });

export const retryManagedAccess = (sessionId: number) =>
  api.request<void>(`/commissioning/sessions/${sessionId}/managed-access/retry`, { method: 'POST' });

export const retryRuntimeUpdate = (controllerId: number) =>
  api.request<void>(`/controllers/${controllerId}/runtime-update/retry`, { method: 'POST' });

export const reviewConfiguration = (id: number) =>
  api.request<ConfigurationReview>(`/controllers/${id}/configuration/review`, { method: 'POST' });

export const revokeCommissioningSession = (id: number) =>
  api.request<CommissioningSession>(`/commissioning/sessions/${id}/revoke`, { method: 'POST' });

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

export const saveDraft = (
  id: number,
  snapshot: unknown,
  metadata?: ConfigurationEditorMetadata,
  expectedDraft?: DraftIdentity | null,
) =>
  api.request<WagoConfigurationDraft>(`/controllers/${id}/configuration/draft`, {
    method: 'POST',
    body: { snapshot, metadata, expectedDraft },
  });

export const setSettings = (defaultMqttServerId: number | null) =>
  api.request<WagoSettings>('/settings', { method: 'POST', body: { defaultMqttServerId } });

export const validateConfiguration = (id: number, snapshot: WagoConfigurationSnapshot) =>
  api.request<{ valid: boolean; errors: ConfigurationValidationError[] }>(`/controllers/${id}/configuration/validate`, {
    method: 'POST',
    body: { snapshot },
  });
