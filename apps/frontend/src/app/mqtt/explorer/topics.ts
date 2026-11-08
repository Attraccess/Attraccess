// Mirrors the API's rules in apps/api/src/mqtt/explorer/mqtt-explorer.constants.ts.

// Longest topic filter in UTF-8 bytes.
export const MAX_FILTER_BYTES = 256;
const MAX_TOPIC_BYTES = 1024;

const byteLength = (value: string) => new TextEncoder().encode(value).length;

// MQTT 3.1.1 §4.7: `+` and `#` must occupy a whole level, `#` only the last one,
// the filter stays within MAX_FILTER_BYTES, and shared-subscription filters
// (`$share/`, `$queue/`) are refused.
export function isValidTopicFilter(filter: string): boolean {
  if (filter.length === 0 || byteLength(filter) > MAX_FILTER_BYTES || filter.includes('\0')) return false;
  if (filter.startsWith('$share/') || filter.startsWith('$queue/')) return false;
  const levels = filter.split('/');
  return levels.every((level, index) => {
    if (level === '#') return index === levels.length - 1;
    if (level === '+') return true;
    return !level.includes('#') && !level.includes('+');
  });
}

// A topic to publish to is non-empty and wildcard-free.
export function isPublishableTopic(topic: string): boolean {
  return topic.length > 0 && !/[+#\0]/.test(topic) && byteLength(topic) <= MAX_TOPIC_BYTES;
}

// Topics a flow's MQTT nodes use, offered as one-press suggestions. Templated
// topics (`{{ ... }}`) are not concrete and are skipped.
export interface TopicSuggestions {
  /** Valid as a subscription filter. */
  filters: string[];
  /** Concrete, wildcard-free: valid as a publish topic. */
  topics: string[];
}
