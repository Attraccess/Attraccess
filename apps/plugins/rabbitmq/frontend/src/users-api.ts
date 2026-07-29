// Frontend access to the plugin's RabbitMQ user-management endpoints (ATT-522).
//
// The backend half (apps/plugins/rabbitmq/backend) mounts the routes under
// `/rabbitmq/users/...` in the host API. Shapes are restated here (the backend
// and frontend are separate bundles with no shared module), mirroring
// backend/rabbitmq-users.types.ts.

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

// Host mounts plugin controllers under `/api`; cookies carry the session.
const BASE = '/api/rabbitmq/users';

// The backend wraps upstream failures in HTTP exceptions whose `message`
// explains what went wrong (broker unreachable, missing management
// privileges, …) — surface that text instead of a bare status code.
async function parseError(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    if (message) {
      return new Error(message);
    }
  } catch {
    // Non-JSON error body — fall through to the generic message.
  }
  return new Error(`Request failed (HTTP ${res.status}).`);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    throw await parseError(res);
  }
  const text = await res.text();
  return (text.length > 0 ? JSON.parse(text) : null) as T;
}

export function fetchUsers(mqttServerId: number): Promise<RabbitmqUserList> {
  return request<RabbitmqUserList>(`${BASE}/${mqttServerId}`);
}

export function upsertUser(mqttServerId: number, username: string, body: UpsertRabbitmqUserBody): Promise<void> {
  return request<void>(`${BASE}/${mqttServerId}/${encodeURIComponent(username)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteUser(mqttServerId: number, username: string): Promise<void> {
  return request<void>(`${BASE}/${mqttServerId}/${encodeURIComponent(username)}`, { method: 'DELETE' });
}

export function setPermissions(
  mqttServerId: number,
  username: string,
  permission: RabbitmqPermission
): Promise<void> {
  return request<void>(`${BASE}/${mqttServerId}/${encodeURIComponent(username)}/permissions`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(permission),
  });
}

export function clearPermissions(mqttServerId: number, username: string, vhost: string): Promise<void> {
  return request<void>(
    `${BASE}/${mqttServerId}/${encodeURIComponent(username)}/permissions?vhost=${encodeURIComponent(vhost)}`,
    { method: 'DELETE' }
  );
}
