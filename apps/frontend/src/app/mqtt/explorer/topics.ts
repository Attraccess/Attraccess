// The filter, topic and payload rules are shared with the API (libs/shared/src/lib/mqtt-explorer.ts).
export {
  isPublishablePayload,
  isPublishableTopic,
  isValidTopicFilter,
  MAX_FILTER_BYTES,
  MAX_PUBLISH_PAYLOAD_BYTES,
} from '@attraccess/shared';

// Topics a flow's MQTT nodes use, offered as one-press suggestions. Templated
// topics (`{{ ... }}`) are not concrete and are skipped.
export interface TopicSuggestions {
  /** Valid as a subscription filter. */
  filters: string[];
  /** Concrete, wildcard-free: valid as a publish topic. */
  topics: string[];
}
