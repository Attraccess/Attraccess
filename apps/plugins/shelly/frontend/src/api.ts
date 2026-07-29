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

export interface DiscoveredDevice {
  deviceId: number;
  ipAddress: string;
  name: string;
  generation: number;
  model: string | null;
  authState: AuthState;
  /** True when this run added the device; false when it was already registered. */
  isNew: boolean;
  source: 'mdns' | 'scan';
}

export interface DiscoveryResult {
  subnets: string[];
  probed: number;
  devices: DiscoveredDevice[];
}

/**
 * Runs discovery on the server (mDNS + subnet scan) and returns what it found.
 * Slow by nature — a /24 scan takes a few seconds — so callers must show a
 * pending state.
 */
export function discoverDevices(input: { cidr?: string } = {}): Promise<DiscoveryResult> {
  return request<DiscoveryResult>('/discovery', { method: 'POST', body: input });
}
