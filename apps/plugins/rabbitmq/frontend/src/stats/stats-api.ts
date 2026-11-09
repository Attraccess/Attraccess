// Frontend access to the plugin's broker stats endpoint (ATT-524). Shapes are
// restated from backend/stats/service.ts.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';

export interface RabbitmqOverview {
  rabbitmqVersion: string | null;
  erlangVersion: string | null;
  clusterName: string | null;
  connections: number | null;
  channels: number | null;
  queues: number | null;
  consumers: number | null;
  messagesReady: number | null;
  messagesUnacknowledged: number | null;
  publishRate: number | null;
  deliverRate: number | null;
}

export interface RabbitmqNode {
  name: string;
  running: boolean | null;
  memUsed: number | null;
  memLimit: number | null;
  memAlarm: boolean | null;
  diskFree: number | null;
  diskFreeLimit: number | null;
  diskFreeAlarm: boolean | null;
  fdUsed: number | null;
  fdTotal: number | null;
  socketsUsed: number | null;
  socketsTotal: number | null;
  uptime: number | null;
}

export interface RabbitmqQueue {
  vhost: string;
  name: string;
  type: string | null;
  state: string | null;
  messagesReady: number | null;
  messagesUnacknowledged: number | null;
  consumers: number | null;
}

export interface RabbitmqStats {
  mqttServerId: number;
  overview: RabbitmqOverview;
  nodes: RabbitmqNode[];
  queues: RabbitmqQueue[];
  totalQueues: number;
}

const api = createPluginApiClient('/api/rabbitmq/stats');

export function fetchStats(mqttServerId: number): Promise<RabbitmqStats> {
  return api.request<RabbitmqStats>(`/${mqttServerId}`);
}
