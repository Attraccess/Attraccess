// Frontend access to the plugin's connection endpoints (ATT-523). Shapes are
// restated from backend/connections/service.ts (separate bundles, no shared
// module).
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';

export interface RabbitmqConnection {
  name: string;
  clientId: string | null;
  user: string | null;
  vhost: string | null;
  peerHost: string | null;
  peerPort: number | null;
  protocol: string | null;
  state: string | null;
  ssl: boolean;
  connectedAt: number | null;
  channels: number | null;
  recvBytes: number | null;
  sendBytes: number | null;
  recvRate: number | null;
  sendRate: number | null;
}

export interface RabbitmqConnectionList {
  mqttServerId: number;
  total: number;
  truncated: boolean;
  connections: RabbitmqConnection[];
}

const api = createPluginApiClient('/api/rabbitmq/connections');

export function fetchConnections(mqttServerId: number): Promise<RabbitmqConnectionList> {
  return api.request<RabbitmqConnectionList>(`/${mqttServerId}`);
}

export function closeConnection(mqttServerId: number, name: string, reason?: string): Promise<void> {
  return api.request<void>(`/${mqttServerId}`, {
    method: 'DELETE',
    query: { name, reason: reason?.trim() ? reason.trim() : undefined },
  });
}
