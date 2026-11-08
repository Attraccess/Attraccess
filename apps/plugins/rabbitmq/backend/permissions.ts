// The two permission tiers of the RabbitMQ plugin.
//
// Plugins cannot declare their own permission keys yet (planned in ATT-1003), so
// both tiers reuse existing core keys. Every route and live topic references
// these constants, so switching to plugin-declared keys later is a one-file
// change.

// View tier — same level as the host MQTT server page: detection/status, user
// list, connections list and broker stats.
export const RABBITMQ_VIEW_PERMISSION = 'resources.update' as const;

// Manage tier — everything that changes the broker: user create/update/delete,
// permissions and closing connections. The live MQTT message explorer is not
// part of the plugin: it is a core feature for every broker.
export const RABBITMQ_MANAGE_PERMISSION = 'system.settings.manage' as const;
