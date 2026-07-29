// Access to the plugin's own backend endpoints (`/api/shelly/*`) through the
// SDK's preconfigured client — it supplies the host's API origin, the session
// cookie and JSON/error handling.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';

export type AuthState = 'unknown' | 'none' | 'required';

export interface ShellyDevice {
  id: number;
  name: string;
  ipAddress: string;
  generation: number | null;
  model: string | null;
  authState: AuthState;
  lastProbeAt: string | null;
  lastProbeError: string | null;
  createdAt: string;
  updatedAt: string;
}

const api = createPluginApiClient('/api/shelly');

export function listDevices(): Promise<ShellyDevice[]> {
  return api.request<ShellyDevice[]>('/devices');
}

export function addDevice(input: { ipAddress: string; name?: string }): Promise<ShellyDevice> {
  return api.request<ShellyDevice>('/devices', { method: 'POST', body: input });
}

export function reprobeDevice(id: number): Promise<ShellyDevice> {
  return api.request<ShellyDevice>(`/devices/${id}/probe`, { method: 'POST' });
}

export function deleteDevice(id: number): Promise<{ deleted: boolean }> {
  return api.request<{ deleted: boolean }>(`/devices/${id}`, { method: 'DELETE' });
}
