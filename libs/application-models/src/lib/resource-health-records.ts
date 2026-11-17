import type { ResourceHealthSource, ResourceHealthStatus } from './resourceHealthState';

/** One health entry of a resource: the latest report of one source (identifier) of that resource. */
export interface ResourceHealthRecord {
  id: number;
  resourceId: number;
  /** Empty for the resource default. */
  identifier: string;
  status: ResourceHealthStatus;
  reason: string | null;
  source: ResourceHealthSource;
  lastReportedAt: Date;
}
