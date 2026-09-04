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

export interface ShellyDeviceInfo {
  generation: number;
  status: unknown;
  config: unknown;
  fetchedAt: string;
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

// POST so the optional device admin password travels in the body, not the URL.
export function getDeviceInfo(
  id: number,
  input?: { username?: string; currentPassword?: string },
): Promise<ShellyDeviceInfo> {
  return api.request<ShellyDeviceInfo>(`/devices/${id}/info`, { method: 'POST', body: input ?? {} });
}

export type FirmwareStage = 'stable' | 'beta';
export type FirmwareState = 'idle' | 'pending' | 'updating' | 'unknown';

export interface FirmwareStatus {
  generation: number;
  currentVersion: string | null;
  available: Record<FirmwareStage, string | null>;
  hasUpdate: boolean;
  state: FirmwareState;
  fetchedAt: string;
}

export interface FirmwareOverviewEntry {
  deviceId: number;
  status: FirmwareStatus | null;
  error: string | null;
}

/** Firmware state of every registered device, checked in one round trip. */
export function listFirmware(): Promise<FirmwareOverviewEntry[]> {
  return api.request<FirmwareOverviewEntry[]>('/devices/firmware');
}

export function getFirmware(
  id: number,
  input?: { username?: string; currentPassword?: string },
): Promise<FirmwareStatus> {
  const params = new URLSearchParams();
  if (input?.username) params.set('username', input.username);
  if (input?.currentPassword) params.set('currentPassword', input.currentPassword);
  const query = params.size ? `?${params.toString()}` : '';
  return api.request<FirmwareStatus>(`/devices/${id}/firmware${query}`);
}

export function startFirmwareUpdate(
  id: number,
  input: { stage: FirmwareStage; username?: string; currentPassword?: string },
): Promise<{ started: true; stage: FirmwareStage }> {
  return api.request<{ started: true; stage: FirmwareStage }>(`/devices/${id}/firmware/update`, {
    method: 'POST',
    body: input,
  });
}

export function setAdminPassword(
  id: number,
  input: { username?: string; currentPassword?: string; password: string },
): Promise<ShellyDevice> {
  return api.request<ShellyDevice>(`/devices/${id}/auth`, { method: 'POST', body: input });
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
  return api.request<DiscoveryResult>('/discovery', { method: 'POST', body: input });
}
