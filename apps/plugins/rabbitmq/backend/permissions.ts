// The two permission tiers of the RabbitMQ plugin.
//
// Plugins cannot declare their own permission keys yet (planned in ATT-1003), so
// both tiers reuse existing core keys. Every route and live topic references
// these constants, so switching to plugin-declared keys later is a one-file
// change.

// View tier — same level as the host MQTT server page: detection/status, user
// list, connections list and broker stats.
export const RABBITMQ_VIEW_PERMISSION = 'resources.update' as const;

// Manage tier — everything that changes the broker or exposes message payloads:
// user create/update/delete, permissions, closing connections, the live message
// viewer and publishing.
export const RABBITMQ_MANAGE_PERMISSION = 'system.settings.manage' as const;
