import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarDate, getLocalTimeZone } from '@internationalized/date';
import { computeRange, daysBetween, rangeToDateBounds, type Preset } from './compute-range';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-03-15T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});
it.each<[Preset, string, string]>([
  ['today', '2024-03-15', '2024-03-15'],
  ['yesterday', '2024-03-14', '2024-03-14'],
  ['last7d', '2024-03-09', '2024-03-15'],
  ['last30d', '2024-02-15', '2024-03-15'],
  ['thisMonth', '2024-03-01', '2024-03-15'],
  ['lastMonth', '2024-02-01', '2024-02-29'],
  ['thisYear', '2024-01-01', '2024-03-15'],
])('computes inclusive %s bounds across leap-year dates', (preset, start, end) => {
  const range = computeRange(preset);
  expect(range?.start.toString()).toBe(start);
  expect(range?.end.toString()).toBe(end);
});
it('handles the previous year and custom ranges', () => {
  vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  expect(computeRange('lastMonth')?.start.toString()).toBe('2023-12-01');
  expect(computeRange('lastMonth')?.end.toString()).toBe('2023-12-31');
  expect(computeRange('custom')).toBeNull();
});
it('counts inclusive days and applies the entire final day to export bounds', () => {
  const range = { start: new CalendarDate(2024, 3, 10), end: new CalendarDate(2024, 3, 15) };
  expect(daysBetween(range)).toBe(6);
  expect(daysBetween(null)).toBeNull();
  expect(rangeToDateBounds(range, new Date(0))).toEqual({
    start: new Date(2024, 2, 10),
    end: new Date(2024, 2, 15, 23, 59, 59, 999),
  });
});
it('does not mutate the fallback date when there is no selected range', () => {
  const fallback = new Date('2024-03-15T12:34:00Z');
  expect(rangeToDateBounds(null, fallback)).toEqual({ start: fallback, end: new Date(2024, 2, 15, 23, 59, 59, 999) });
  expect(fallback.toISOString()).toBe('2024-03-15T12:34:00.000Z');
});

describe('rangeToDateBounds', () => {
  it('uses end-of-day for the end bound so usages on the end day are included', () => {
    const range = {
      start: new CalendarDate(2026, 5, 1),
      end: new CalendarDate(2026, 5, 30),
    };

    const { start, end } = rangeToDateBounds(range, new Date(0));

    const tz = getLocalTimeZone();
    const expectedStart = new CalendarDate(2026, 5, 1).toDate(tz);
    const expectedEndDay = new CalendarDate(2026, 5, 30).toDate(tz);

    expect(start.getTime()).toBe(expectedStart.getTime());
    expect(end.getFullYear()).toBe(expectedEndDay.getFullYear());
    expect(end.getMonth()).toBe(expectedEndDay.getMonth());
    expect(end.getDate()).toBe(expectedEndDay.getDate());
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it('makes a single-day range cover the entire day', () => {
    const today = new CalendarDate(2026, 5, 25);
    const range = { start: today, end: today };

    const { start, end } = rangeToDateBounds(range, new Date(0));

    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('falls back to provided fallback date when range is null', () => {
    const fallback = new Date('2026-05-25T10:00:00');
    const { start, end } = rangeToDateBounds(null, fallback);

    expect(start.getTime()).toBe(fallback.getTime());
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });
});
