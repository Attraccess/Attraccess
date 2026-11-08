// Frontend access to the plugin's message explorer (ATT-525): the publish
// endpoint plus the live-topic shapes, restated from backend/messages/service.ts.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';

export interface RabbitmqLiveMessage {
  topic: string;
  // Base64 of the (possibly truncated) payload.
  payload: string;
  size: number;
  truncated: boolean;
  receivedAt: number;
}

// A failed broker subscription reaches the client as a host 'rejected' frame (onUnavailable).
export interface RabbitmqLiveEvent {
  eventType: 'messages';
  messages: RabbitmqLiveMessage[];
  dropped: number;
}

export interface PublishBody {
  topic: string;
  payload: string;
  qos: 0 | 1 | 2;
  retain: boolean;
}

// `<serverId>.<base64url(filter)>` — base64url has no `/`, `+` or `#`.
export function liveIdentifier(mqttServerId: number, filter: string): string {
  const bytes = new TextEncoder().encode(filter);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `${mqttServerId}.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

const api = createPluginApiClient('/api/rabbitmq/messages');

export function publishMessage(mqttServerId: number, body: PublishBody): Promise<void> {
  return api.request<void>(`/${mqttServerId}/publish`, { method: 'POST', body });
}

// Mirrors the backend: a topic to publish to is non-empty and wildcard-free.
export function isPublishableTopic(topic: string): boolean {
  return topic.length > 0 && !/[+#]/.test(topic);
}

// Longest topic filter in UTF-8 bytes. The host caps live identifiers at 128
// characters, and `<serverId>.<base64url(filter)>` must fit. Mirrors the backend.
export const MAX_FILTER_BYTES = 85;

// Mirrors the backend's topic-filter rules (MQTT 3.1.1 §4.7): `+` and `#` must
// occupy a whole level, `#` only the last one, the filter stays within
// MAX_FILTER_BYTES, and shared-subscription filters (`$share/`, `$queue/`) are refused.
export function isValidTopicFilter(filter: string): boolean {
  if (filter.length === 0 || new TextEncoder().encode(filter).length > MAX_FILTER_BYTES || filter.includes('\0'))
    return false;
  if (filter.startsWith('$share/') || filter.startsWith('$queue/')) return false;
  const levels = filter.split('/');
  return levels.every((level, index) => {
    if (level === '#') return index === levels.length - 1;
    if (level === '+') return true;
    return !level.includes('#') && !level.includes('+');
  });
}
