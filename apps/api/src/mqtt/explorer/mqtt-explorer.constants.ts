// Filter and topic rules, limits and the event shape are shared with the frontend.
export {
  MAX_FILTER_BYTES,
  MAX_PUBLISH_PAYLOAD_BYTES,
  MAX_TOPIC_BYTES,
  type MqttExplorerEvent,
  type MqttExplorerMessage,
  isPublishableTopic,
  topicMatchesFilter,
  utf8ByteLength,
  validateTopicFilter,
} from '@attraccess/shared';

/** Watching and publishing is open to everyone who can edit resources (MQTT server pages, flows). */
export const MQTT_EXPLORER_PERMISSION = 'resources.update';

export const MQTT_EXPLORER_LIVE_TOPIC = 'mqtt-messages';

// Payloads above this are cut; `size` still reports the real length.
export const MAX_PAYLOAD_BYTES = 64 * 1024;

// Messages are batched and flushed on this interval. Each flush carries at most
// MAX_BATCH messages and MAX_BATCH_PAYLOAD_CHARS of base64 payload; anything
// beyond that is dropped before it is encoded and reported as `dropped`, so a
// `#` filter on a busy broker cannot flood the browser.
export const FLUSH_INTERVAL_MS = 250;
export const MAX_BATCH = 50;
export const MAX_BATCH_PAYLOAD_CHARS = 512 * 1024;

// Each watched (server, filter) has its own broker connection. It stays open
// this long after the last viewer left.
export const CONNECTION_GRACE_MS = 10_000;
export const CONNECT_TIMEOUT_MS = 10_000;

// Each filter is a stream of up to ~2 MiB/s; this many per user across all tabs.
export const MAX_VIEWS_PER_USER = 8;
// A failed broker connection or subscription is not retried for this long, so a
// client re-sending a rejected subscription cannot reconnect (and audit) every renewal.
export const FAILURE_COOL_DOWN_MS = 30_000;
// The same user watching the same filter on the same server is audited once per window.
export const SUBSCRIBE_AUDIT_WINDOW_MS = 5 * 60_000;
// Bounds the remembered audits and failures.
export const MAX_REMEMBERED_KEYS = 10_000;
// A QoS 1/2 publish the broker does not acknowledge fails after this long.
export const PUBLISH_ACK_TIMEOUT_SECONDS = 10;
// Audit text fields are limited to this many UTF-16 units.
export const MAX_AUDIT_TEXT_LENGTH = 256;
