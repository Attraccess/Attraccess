// Shared types for RabbitMQ user management (ATT-522).
//
// Mirrored on the frontend in frontend/src/users-api.ts — the backend and
// frontend are separate bundles with no shared module (same approach as
// rabbitmq-detection.types.ts).

// Permissions one user holds on one vhost. The three fields are RabbitMQ
// permission regexes (configure / write / read).
export interface RabbitmqPermission {
  readonly vhost: string;
  readonly configure: string;
  readonly write: string;
  readonly read: string;
}

// One RabbitMQ user as the plugin presents it: name, tags and the permissions
// across all vhosts, joined from GET /api/users + GET /api/permissions.
export interface RabbitmqUser {
  readonly name: string;
  readonly tags: string[];
  readonly permissions: RabbitmqPermission[];
}

// Response of GET /rabbitmq/users/:mqttServerId. Includes the vhost list so the
// UI can offer vhost choices without an extra round trip.
export interface RabbitmqUserList {
  readonly mqttServerId: number;
  readonly users: RabbitmqUser[];
  readonly vhosts: string[];
}

// Body of PUT /rabbitmq/users/:mqttServerId/:username (create or update).
// - `password` is required when the user does not exist yet; on update an
//   absent/empty password keeps the current one (we re-send the stored hash).
// - `tags` replaces the user's tags (empty array = no tags).
// - `permissions`, when present, is applied per vhost after the user upsert.
export interface UpsertRabbitmqUserDto {
  password?: string;
  tags?: string[];
  permissions?: RabbitmqPermission[];
}

// Body of PUT /rabbitmq/users/:mqttServerId/:username/permissions.
export interface SetRabbitmqPermissionDto {
  vhost: string;
  configure: string;
  write: string;
  read: string;
}

// The permissions an MQTT client needs on a RabbitMQ broker: it may only
// (re)declare its own subscription queues, and publish/consume via the topic
// exchange. Documented in .env.docker-compose at the repo root.
export const DEFAULT_MQTT_PERMISSIONS = {
  configure: '^mqtt-subscription-.*$',
  write: '^(amq\\.topic|mqtt-subscription-.*)$',
  read: '^(amq\\.topic|mqtt-subscription-.*)$',
} as const;
