/** Watching and publishing is open to everyone who can edit resources (MQTT server pages, flows). */
export const MQTT_EXPLORER_PERMISSION = 'resources.update';

export const MQTT_EXPLORER_LIVE_TOPIC = 'mqtt-messages';

// Payloads above this are cut; `size` still reports the real length.
export const MAX_PAYLOAD_BYTES = 64 * 1024;
export const MAX_PUBLISH_PAYLOAD_BYTES = 256 * 1024;
export const MAX_TOPIC_BYTES = 1024;
// Mirrored on the frontend (apps/frontend/src/app/mqtt/explorer/topics.ts).
export const MAX_FILTER_BYTES = 256;

// Messages are batched and flushed on this interval. Each flush carries at most
// MAX_BATCH messages and MAX_BATCH_PAYLOAD_CHARS of base64 payload; anything
// beyond that is dropped before it is encoded and reported as `dropped`, so a
// `#` filter on a busy broker cannot flood the browser.
export const FLUSH_INTERVAL_MS = 250;
export const MAX_BATCH = 50;
export const MAX_BATCH_PAYLOAD_CHARS = 512 * 1024;

// The explorer's own broker connection stays open this long after the last viewer left.
export const CONNECTION_GRACE_MS = 10_000;
export const CONNECT_TIMEOUT_MS = 10_000;

export interface MqttExplorerMessage {
  readonly topic: string;
  /** Base64 of the (possibly truncated) payload bytes. */
  readonly payload: string;
  /** Real payload size in bytes. */
  readonly size: number;
  readonly truncated: boolean;
  /** Epoch milliseconds. */
  readonly receivedAt: number;
}

/** A failed broker subscription errors the stream, which the client sees as unavailable. */
export type MqttExplorerEvent = {
  readonly eventType: 'messages';
  readonly messages: MqttExplorerMessage[];
  readonly dropped: number;
};

/**
 * MQTT 3.1.1 §4.7: `+` and `#` must occupy a whole level, `#` only the last.
 * Shared-subscription filters (`$share/...`, `$queue/...`) are refused: they
 * would join a consumer group and take messages away from real consumers.
 */
export function validateTopicFilter(filter: unknown): filter is string {
  if (typeof filter !== 'string') return false;
  if (filter.length === 0 || Buffer.byteLength(filter) > MAX_FILTER_BYTES || filter.includes('\0')) return false;
  if (filter.startsWith('$share/') || filter.startsWith('$queue/')) return false;
  const levels = filter.split('/');
  return levels.every((level, index) => {
    if (level === '#') return index === levels.length - 1;
    if (level === '+') return true;
    return !level.includes('#') && !level.includes('+');
  });
}

/** Whether a (valid) filter matches a concrete topic. Wildcards never match `$`-topics at the first level. */
export function topicMatchesFilter(filter: string, topic: string): boolean {
  const filterLevels = filter.split('/');
  const topicLevels = topic.split('/');
  if (topic.startsWith('$') && (filterLevels[0] === '#' || filterLevels[0] === '+')) return false;
  for (let index = 0; index < filterLevels.length; index++) {
    const level = filterLevels[index];
    if (level === '#') return true;
    if (index >= topicLevels.length) return false;
    if (level !== '+' && level !== topicLevels[index]) return false;
  }
  return filterLevels.length === topicLevels.length;
}
