import { describe, expect, it } from 'vitest';
import { CalendarDate, getLocalTimeZone } from '@internationalized/date';
import { rangeToDateBounds } from './compute-range';

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
