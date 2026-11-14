// URL <-> date range conversion for the CSV export pages
// FEATURE: CSV export — the selected range travels in ?start=<ISO>&end=<ISO> so reloads and deep links keep it
import { DateValue, RangeValue } from '@heroui/react';
import { fromDate, getLocalTimeZone, toCalendarDate } from '@internationalized/date';
import { computeRange, DateBounds, rangeToDateBounds } from './date-range-section/compute-range';

export const EXPORT_PATHS = {
  resourceUsageHours: '/csv-export/resource-usage-hours',
  resourceHoursSummary: '/csv-export/resource-hours-summary',
  billingTransactions: '/csv-export/billing-transactions',
} as const;

export type ExportTypeKey = keyof typeof EXPORT_PATHS;

export function boundsToSearch(bounds: DateBounds): string {
  return new URLSearchParams({ start: bounds.start.toISOString(), end: bounds.end.toISOString() }).toString();
}

export function boundsToRange(bounds: DateBounds): RangeValue<DateValue> {
  const tz = getLocalTimeZone();
  return {
    start: toCalendarDate(fromDate(bounds.start, tz)),
    end: toCalendarDate(fromDate(bounds.end, tz)),
  };
}

// boundsToSearch always writes full ISO timestamps; anything looser (`1`, `2026-09-01`) is a hand-edited URL
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function parseIsoParam(value: string | null): Date | null {
  if (value === null || !ISO_TIMESTAMP.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Valid `start`/`end` params, or the default preset (last 30 days) when missing, unparsable or reversed. */
export function parseRangeSearchParams(
  params: URLSearchParams,
  now = new Date(),
): DateBounds & { isFallback: boolean } {
  const start = parseIsoParam(params.get('start'));
  const end = parseIsoParam(params.get('end'));
  if (start && end && start.getTime() <= end.getTime()) {
    return { start, end, isFallback: false };
  }
  return { ...rangeToDateBounds(computeRange('last30d'), now), isFallback: true };
}
