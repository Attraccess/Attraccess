// Compute date range presets into RangeValue<DateValue> for HeroUI RangeCalendar
// FEATURE: CSV export — preset shortcuts for picking common date ranges
import { CalendarDate, DateValue, getLocalTimeZone, today } from '@internationalized/date';
import { RangeValue } from '@heroui/react';

export type Preset =
  | 'today'
  | 'yesterday'
  | 'last7d'
  | 'last30d'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom';

export const PRESET_ORDER: Preset[] = [
  'today',
  'yesterday',
  'last7d',
  'last30d',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'custom',
];

function startOfMonth(d: CalendarDate): CalendarDate {
  return new CalendarDate(d.year, d.month, 1);
}

function endOfMonth(d: CalendarDate): CalendarDate {
  return startOfMonth(d).add({ months: 1 }).subtract({ days: 1 });
}

export function computeRange(preset: Preset): RangeValue<DateValue> | null {
  const t = today(getLocalTimeZone());
  switch (preset) {
    case 'today':
      return { start: t, end: t };
    case 'yesterday': {
      const y = t.subtract({ days: 1 });
      return { start: y, end: y };
    }
    case 'last7d':
      return { start: t.subtract({ days: 6 }), end: t };
    case 'last30d':
      return { start: t.subtract({ days: 29 }), end: t };
    case 'thisMonth':
      return { start: startOfMonth(t), end: t };
    case 'lastMonth': {
      const prev = startOfMonth(t).subtract({ months: 1 });
      return { start: prev, end: endOfMonth(prev) };
    }
    case 'thisYear':
      return { start: new CalendarDate(t.year, 1, 1), end: t };
    case 'custom':
      return null;
  }
}

export function daysBetween(range: RangeValue<DateValue> | null | undefined): number | null {
  if (!range?.start || !range?.end) return null;
  const start = range.start.toDate(getLocalTimeZone());
  const end = range.end.toDate(getLocalTimeZone());
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff;
}
