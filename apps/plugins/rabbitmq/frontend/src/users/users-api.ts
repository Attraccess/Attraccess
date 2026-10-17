// Frontend access to the plugin's RabbitMQ user-management endpoints (ATT-522).
//
// The backend half (apps/plugins/rabbitmq/backend) mounts the routes under
// `/rabbitmq/users/...` in the host API. Shapes are restated here (the backend
// and frontend are separate bundles with no shared module), mirroring
// backend/rabbitmq-users.types.ts.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';

export interface RabbitmqPermission {
  vhost: string;
  configure: string;
  write: string;
  read: string;
}

export interface RabbitmqUser {
  name: string;
  tags: string[];
  permissions: RabbitmqPermission[];
}

export interface RabbitmqUserList {
  mqttServerId: number;
  users: RabbitmqUser[];
  vhosts: string[];
}

export interface UpsertRabbitmqUserBody {
  password?: string;
  tags?: string[];
  permissions?: RabbitmqPermission[];
}

// The permissions an MQTT client needs on a RabbitMQ broker (mirrors the
// backend's DEFAULT_MQTT_PERMISSIONS, documented in .env.docker-compose).
export const DEFAULT_MQTT_PERMISSIONS = {
  configure: '^mqtt-subscription-.*$',
  write: '^(amq\\.topic|mqtt-subscription-.*)$',
  read: '^(amq\\.topic|mqtt-subscription-.*)$',
} as const;

// Host mounts plugin controllers under `/api`; the SDK client supplies the
// origin, session cookie and JSON/error handling.
const api = createPluginApiClient('/api/rabbitmq/users');

export function fetchUsers(mqttServerId: number): Promise<RabbitmqUserList> {
  return api.request<RabbitmqUserList>(`/${mqttServerId}`);
}

export function upsertUser(mqttServerId: number, username: string, body: UpsertRabbitmqUserBody): Promise<void> {
  return api.request<void>(`/${mqttServerId}/${encodeURIComponent(username)}`, { method: 'PUT', body });
}

export function deleteUser(mqttServerId: number, username: string): Promise<void> {
  return api.request<void>(`/${mqttServerId}/${encodeURIComponent(username)}`, { method: 'DELETE' });
}

export function setPermissions(mqttServerId: number, username: string, permission: RabbitmqPermission): Promise<void> {
  return api.request<void>(`/${mqttServerId}/${encodeURIComponent(username)}/permissions`, {
    method: 'PUT',
    body: permission,
  });
}

export function clearPermissions(mqttServerId: number, username: string, vhost: string): Promise<void> {
  return api.request<void>(`/${mqttServerId}/${encodeURIComponent(username)}/permissions`, {
    method: 'DELETE',
    query: { vhost },
  });
}
