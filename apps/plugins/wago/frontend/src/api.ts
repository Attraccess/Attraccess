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
const api = createPluginApiClient('/api/wago');
export const listControllers = () => api.request<WagoController[]>('/controllers');
export const getSettings = () => api.request<WagoSettings>('/settings');
export const setSettings = (defaultMqttServerId: number | null) =>
  api.request<WagoSettings>('/settings', { method: 'POST', body: { defaultMqttServerId } });
export const claimController = (id: number, input: { name: string; verifier: string; mqttServerId?: number }) =>
  api.request<WagoController>(`/controllers/${id}/claim`, { method: 'POST', body: input });
