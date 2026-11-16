// Access to the plugin's own backend endpoints (`/api/matter/*`) through the SDK's preconfigured client.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';

export type ConnectionState = 'not_configured' | 'connecting' | 'connected' | 'degraded';
export type DegradedReason = 'unavailable' | 'unauthorized' | 'incompatible' | 'misconfigured';

export interface SupportedCombination {
  wireVersion: number;
  attraccess: string;
  plugin: string;
  sidecar: string;
  matterJs: string;
}

export interface ConnectionStatus {
  state: ConnectionState;
  reason: DegradedReason | null;
  reasonDetail: string | null;
  since: string;
  lastError: {
    code: string;
    message: string;
    correlationId: string | null;
    details?: { received?: Record<string, unknown>; supported?: SupportedCombination[] };
  } | null;
  nextRetryAt: string | null;
  sidecar: { sidecar: string; matterJs: string; wireVersion: number; build: { version: string } } | null;
  wireVersion: number;
  capabilities: { capabilities: { family: string; available: boolean }[] } | null;
  insecureTransport: boolean;
  supported: SupportedCombination[];
}

export interface ConnectionSettings {
  url: string | null;
  credentialConfigured: boolean;
  credentialUpdatedAt: string | null;
  caCertificate: string | null;
  updatedAt: string | null;
}

export interface SettingsInput {
  url: string;
  /** Omitted keeps the stored credential. */
  credential?: string;
  /** A PEM string sets it, `null` clears it, omitted keeps it. */
  caCertificate?: string | null;
}

const api = createPluginApiClient('/api/matter/connection');

export const getSettings = () => api.request<ConnectionSettings>('');
export const getStatus = () => api.request<ConnectionStatus>('/status');
export const saveSettings = (input: SettingsInput) =>
  api.request<ConnectionSettings>('', { method: 'PUT', body: input });
export const removeSettings = () => api.request<null>('', { method: 'DELETE' });
