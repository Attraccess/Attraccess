import { ResourceOperatingInterval, ResourceUsage } from '@attraccess/database-entities';
export const ATTRIBUTION_LOOKBACK_MS = 31 * 24 * 60 * 60_000;
export const groupByResourceId = <T extends { resourceId: number }>(items: T[]): Map<number, T[]> => {
  const grouped = new Map<number, T[]>();
  for (const item of items) {
    const resourceItems = grouped.get(item.resourceId) ?? [];
    resourceItems.push(item);
    grouped.set(item.resourceId, resourceItems);
  }
  return grouped;
};

export interface ResourceOperatingAttribution {
  operatingIntervalId: number;
  usageId: number;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  isProvisional: boolean;
}

export interface ResourceOperatingAttributionSummary {
  asOf: Date;
  windowStart: Date | null;
  sessionDurationMs: number;
  operatingDataAvailable: boolean;
  operatingDurationMs: number | null;
  attributedOperatingDurationMs: number | null;
  unattributedOperatingDurationMs: number | null;
  isOperating: boolean;
  isProvisional: boolean;
  attributions: ResourceOperatingAttribution[];
}
export interface TimeRange {
  startTime: Date;
  endTime: Date;
}

export interface ResourceDurationWindow {
  key: string;
  resourceId: number;
  start: Date;
}

export interface ResourceDurations {
  sessionDurationMs: number;
  operatingDurationMs: number;
}
export interface OperatingRange {
  interval: ResourceOperatingInterval;
  range: TimeRange;
}
export interface UsageRange {
  usage: ResourceUsage;
  range: TimeRange;
}
export type SweepEvent =
  | { type: 'operatingStart' | 'operatingEnd'; range: OperatingRange }
  | { type: 'usageStart' | 'usageEnd'; range: UsageRange };
