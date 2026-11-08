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

export type RabbitmqLiveEvent =
  { eventType: 'messages'; messages: RabbitmqLiveMessage[]; dropped: number } | { eventType: 'unavailable' };

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
