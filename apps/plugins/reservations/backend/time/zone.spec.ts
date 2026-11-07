import {
  addLocalDays,
  getWallClock,
  isValidTimeZone,
  localDateKey,
  localMinutesOfDay,
  offsetMs,
  startOfLocalDay,
  wallClockToDate,
  weekdayOf,
} from './zone';

const BERLIN = 'Europe/Berlin';
const NEW_YORK = 'America/New_York';

describe('zone', () => {
  it('validates IANA names', () => {
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(5)).toBe(false);
  });

  it('reads wall clock and offsets across DST', () => {
    expect(offsetMs(new Date('2026-01-15T12:00:00Z'), BERLIN)).toBe(3_600_000);
    expect(offsetMs(new Date('2026-07-15T12:00:00Z'), BERLIN)).toBe(7_200_000);
    expect(getWallClock(new Date('2026-07-15T22:30:00Z'), BERLIN)).toMatchObject({ day: 16, hour: 0, minute: 30 });
    expect(localMinutesOfDay(new Date('2026-07-15T07:15:00Z'), BERLIN)).toBe(9 * 60 + 15);
  });

  it('converts wall clock to UTC in normal periods', () => {
    expect(wallClockToDate({ year: 2026, month: 1, day: 10, hour: 9 }, BERLIN).toISOString()).toBe(
      '2026-01-10T08:00:00.000Z',
    );
    expect(wallClockToDate({ year: 2026, month: 7, day: 10, hour: 9 }, BERLIN).toISOString()).toBe(
      '2026-07-10T07:00:00.000Z',
    );
    expect(wallClockToDate({ year: 2026, month: 7, day: 10, hour: 9 }, 'UTC').toISOString()).toBe(
      '2026-07-10T09:00:00.000Z',
    );
  });

  it('handles the spring-forward gap by moving forward', () => {
    // 2026-03-29 02:30 does not exist in Berlin (02:00 -> 03:00)
    expect(wallClockToDate({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, BERLIN).toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    );
    // 2026-03-08 02:30 does not exist in New York (02:00 -> 03:00)
    expect(wallClockToDate({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, NEW_YORK).toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    );
  });

  it('resolves the fall-back overlap to the first occurrence', () => {
    // 2026-10-25 02:30 happens twice in Berlin: 00:30Z (CEST) and 01:30Z (CET)
    expect(wallClockToDate({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 }, BERLIN).toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    );
  });

  it('computes local day boundaries with 23 and 25 hour days', () => {
    const springStart = startOfLocalDay(new Date('2026-03-29T10:00:00Z'), BERLIN);
    const springEnd = wallClockToDate({ year: 2026, month: 3, day: 30 }, BERLIN);
    expect((springEnd.getTime() - springStart.getTime()) / 3_600_000).toBe(23);
    const autumnStart = startOfLocalDay(new Date('2026-10-25T10:00:00Z'), BERLIN);
    const autumnEnd = wallClockToDate({ year: 2026, month: 10, day: 26 }, BERLIN);
    expect((autumnEnd.getTime() - autumnStart.getTime()) / 3_600_000).toBe(25);
  });

  it('does local calendar arithmetic', () => {
    expect(addLocalDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(addLocalDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(weekdayOf({ year: 2026, month: 6, day: 1 })).toBe(1); // Monday
    expect(localDateKey(new Date('2026-06-01T22:30:00Z'), BERLIN)).toBe('2026-06-02');
  });
});
