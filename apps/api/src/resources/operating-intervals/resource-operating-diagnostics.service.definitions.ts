// Diagnostics over the authoritative machine operating timeline (ATT-1024).
// All views are derived directly from `resource_operating_interval` rows; there are no persisted
// aggregates yet, so verification recomputes derived durations from the timeline and compares.

import { ResourceFlowNodeType } from '@attraccess/database-entities';

export /** A resource with tracking configured but no transition for this long is reported as stale. */
const STALE_SIGNAL_DAYS = 7;
export const DAY_MS = 24 * 60 * 60_000;
export const SAMPLE_LIMIT = 10;
export const TRACKING_NODE_TYPES = [
  ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING,
  ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_IDLE,
];

/** Total length of the union of [start, end) ranges, ignoring empty or inverted ranges. */
export function unionDurationMs(ranges: { start: number; end: number }[]): number {
  const sorted = ranges.filter((range) => range.end > range.start).sort((left, right) => left.start - right.start);
  let total = 0;
  let cursor: number | null = null;
  let currentEnd: number | null = null;

  for (const range of sorted) {
    if (cursor === null || currentEnd === null || range.start >= currentEnd) {
      if (cursor !== null && currentEnd !== null) {
        total += currentEnd - cursor;
      }
      cursor = range.start;
      currentEnd = range.end;
    } else if (range.end > currentEnd) {
      currentEnd = range.end;
    }
  }

  if (cursor !== null && currentEnd !== null) {
    total += currentEnd - cursor;
  }
  return total;
}
