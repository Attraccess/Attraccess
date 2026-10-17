import { Resource } from './resource';

export enum ResourceHealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
}

export enum ResourceHealthSource {
  PAYLOAD = 'payload',
  HEARTBEAT = 'heartbeat',
  MANUAL = 'manual',
}

export interface ResourceHealthState {
  id: number;
  resourceId: number;
  resource: Resource;
  identifier: string;
  status: ResourceHealthStatus;
  reason: string | null;
  source: ResourceHealthSource;
  lastReportedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
