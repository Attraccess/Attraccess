// Access to the plugin's own backend endpoints (`/api/shelly/*`) through the
// SDK's preconfigured client — it supplies the host's API origin, the session
// cookie and JSON/error handling.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';

export type AuthState = 'unknown' | 'none' | 'required';

/**
 * How Attraccess reaches a device. Zigbee devices go through the zigbee2mqtt
 * gateway and never get device-side MQTT config or an admin password (ATT-789).
 */
export type DeviceTransport = 'wifi-mqtt' | 'zigbee';

export interface ShellyDevice {
  id: number;
  name: string;
  ipAddress: string;
  generation: number | null;
  model: string | null;
  authState: AuthState;
  lastProbeAt: string | null;
  lastProbeError: string | null;
  transport: DeviceTransport;
  /** Whether the device answers the Zigbee RPC surface; null if undetermined. */
  zigbeeCapable: boolean | null;
  zigbeeIeeeAddress: string | null;
  zigbeeFriendlyName: string | null;
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
export function getDeviceInfo(id: number, input?: { username?: string; currentPassword?: string }): Promise<ShellyDeviceInfo> {
  return api.request<ShellyDeviceInfo>(`/devices/${id}/info`, { method: 'POST', body: input ?? {} });
}

export function setAdminPassword(
  id: number,
  input: { username?: string; currentPassword?: string; password: string }
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
  zigbeeCapable: boolean | null;
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

// ------------------------------------------------------- Zigbee (ATT-789) --

export interface GatewayStatus {
  configured: boolean;
  connected: boolean;
  /** zigbee2mqtt itself reported `online` on its retained bridge/state topic. */
  bridgeOnline: boolean;
  mqttServerId: number | null;
  baseTopic: string | null;
  deviceCount: number;
  permitJoin: boolean;
  permitJoinEnd: number | null;
  error: string | null;
}

export type PairingStep =
  | 'opening-network'
  | 'enabling-zigbee'
  | 'waiting-for-reboot'
  | 'network-steering'
  | 'waiting-for-join'
  | 'waiting-for-interview'
  | 'linking';

export interface PairingJob {
  deviceId: number;
  status: 'running' | 'succeeded' | 'failed';
  step: PairingStep;
  error: string | null;
  ieeeAddress: string | null;
  friendlyName: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ZigbeeDeviceState {
  ieeeAddress: string;
  friendlyName: string | null;
  gatewayDevice: {
    ieee_address: string;
    friendly_name: string;
    supported?: boolean;
    model_id?: string;
    definition?: { model?: string; vendor?: string; description?: string } | null;
  } | null;
  state: Record<string, unknown> | null;
}

export function getGatewayStatus(): Promise<GatewayStatus> {
  return api.request<GatewayStatus>('/zigbee/gateway');
}

export function saveGateway(input: { mqttServerId: number; baseTopic: string }): Promise<GatewayStatus> {
  return api.request<GatewayStatus>('/zigbee/gateway', { method: 'PUT', body: input });
}

/** Starts pairing. Returns immediately — poll {@link getPairingJob} for progress. */
export function startPairing(id: number, input: { currentPassword?: string } = {}): Promise<PairingJob> {
  return api.request<PairingJob>(`/devices/${id}/zigbee/pair`, { method: 'POST', body: input });
}

export function getPairingJob(id: number): Promise<PairingJob | null> {
  return api.request<PairingJob | null>(`/devices/${id}/zigbee/pair`);
}

export function unpairDevice(id: number): Promise<ShellyDevice> {
  return api.request<ShellyDevice>(`/devices/${id}/zigbee/pair`, { method: 'DELETE' });
}

export function getZigbeeState(id: number): Promise<ZigbeeDeviceState> {
  return api.request<ZigbeeDeviceState>(`/devices/${id}/zigbee/state`);
}

/** Publishes a z2m `/set` payload, e.g. `{state: 'TOGGLE'}`. */
export function setZigbeeState(id: number, payload: Record<string, unknown>): Promise<{ published: boolean }> {
  return api.request<{ published: boolean }>(`/devices/${id}/zigbee/state`, { method: 'POST', body: payload });
}

export interface MqttServerSummary {
  id: number;
  name: string;
  host: string;
  port: number;
}

// The MQTT server list is a host resource, not a plugin one, so it needs a
// client scoped to the host's own route rather than `/api/shelly`.
const hostApi = createPluginApiClient('/api');

export async function listMqttServers(): Promise<MqttServerSummary[]> {
  const servers = await hostApi.request<MqttServerSummary[]>('/mqtt/servers');
  return servers ?? [];
}
