// URL <-> date range conversion for the CSV export pages
// FEATURE: CSV export — the selected range travels in ?start=<ISO>&end=<ISO> so reloads and deep links keep it
import { DateValue, RangeValue } from '@heroui/react';
import { fromDate, getLocalTimeZone, toCalendarDate } from '@internationalized/date';
import { computeRange, DateBounds, rangeToDateBounds } from './date-range-section/compute-range';

export const EXPORT_PATHS = {
  resourceUsageHours: '/csv-export/resource-usage-hours',
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

/** Valid `start`/`end` params, or the default preset (last 30 days) when missing, unparsable or reversed. */
export function parseRangeSearchParams(
  params: URLSearchParams,
  now = new Date(),
): DateBounds & { isFallback: boolean } {
  const start = new Date(params.get('start') ?? '');
  const end = new Date(params.get('end') ?? '');
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start.getTime() <= end.getTime()) {
    return { start, end, isFallback: false };
  }
  return { ...rangeToDateBounds(computeRange('last30d'), now), isFallback: true };
}
