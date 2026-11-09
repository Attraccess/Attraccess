// Rules of the MQTT message explorer, shared by the API and the frontend so the
// two cannot drift apart.

/** Longest subscription filter, in UTF-8 bytes. */
export const MAX_FILTER_BYTES = 256;
/** Longest topic to publish to, in UTF-8 bytes. */
export const MAX_TOPIC_BYTES = 1024;
/** Largest payload to publish, in UTF-8 bytes. */
export const MAX_PUBLISH_PAYLOAD_BYTES = 256 * 1024;

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
export interface MqttExplorerEvent {
  readonly eventType: 'messages';
  readonly messages: MqttExplorerMessage[];
  readonly dropped: number;
}

// Subscribing with these would join a consumer group (`$share/`, `$queue/`) or
// take an exclusive lock (EMQX `$exclusive/`), taking messages away from real consumers.
const CONSUMER_PREFIXES = ['$share/', '$queue/', '$exclusive/'];

const encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).length;
}

/** MQTT 3.1.1 §1.5.3: NUL is forbidden; U+0001–U+001F and U+007F–U+009F should not be used. */
export function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/**
 * MQTT 3.1.1 §4.7: `+` and `#` must occupy a whole level, `#` only the last one.
 * The filter stays within MAX_FILTER_BYTES, has no control characters, and is
 * not a shared or exclusive subscription.
 */
export function isValidTopicFilter(filter: unknown): filter is string {
  if (typeof filter !== 'string' || filter.length === 0 || hasControlCharacter(filter)) return false;
  if (utf8ByteLength(filter) > MAX_FILTER_BYTES) return false;
  if (CONSUMER_PREFIXES.some((prefix) => filter.startsWith(prefix))) return false;
  const levels = filter.split('/');
  return levels.every((level, index) => {
    if (level === '#') return index === levels.length - 1;
    if (level === '+') return true;
    return !level.includes('#') && !level.includes('+');
  });
}

export const validateTopicFilter = isValidTopicFilter;

/** A topic to publish to: non-empty, wildcard-free, no control characters, at most MAX_TOPIC_BYTES. */
export function isPublishableTopic(topic: string): boolean {
  return (
    typeof topic === 'string' &&
    topic.length > 0 &&
    !/[+#]/.test(topic) &&
    !hasControlCharacter(topic) &&
    utf8ByteLength(topic) <= MAX_TOPIC_BYTES
  );
}

/** A payload the API accepts: at most MAX_PUBLISH_PAYLOAD_BYTES. */
export function isPublishablePayload(payload: string): boolean {
  // A UTF-16 unit is at most three UTF-8 bytes, so short strings need no encoding.
  return payload.length <= MAX_PUBLISH_PAYLOAD_BYTES / 3 || utf8ByteLength(payload) <= MAX_PUBLISH_PAYLOAD_BYTES;
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
