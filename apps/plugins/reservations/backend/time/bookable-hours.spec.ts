import { BookableHours, bookableIntervals, isWithinBookableHours, validateBookableHours } from './bookable-hours';

const BERLIN = 'Europe/Berlin';
const weekdays = (ranges: { start: string; end: string }[]): BookableHours => ({
  mon: ranges,
  tue: ranges,
  wed: ranges,
  thu: ranges,
  fri: ranges,
});
const d = (iso: string) => new Date(iso);

describe('bookable hours', () => {
  const office = weekdays([{ start: '09:00', end: '17:00' }]);

  it('treats empty hours as 24/7', () => {
    expect(isWithinBookableHours({}, BERLIN, d('2026-06-06T02:00:00Z'), d('2026-06-06T03:00:00Z'))).toBe(true);
    expect(isWithinBookableHours({ mon: [] }, BERLIN, d('2026-06-06T02:00:00Z'), d('2026-06-06T03:00:00Z'))).toBe(true);
  });

  it('accepts bookings inside a range and rejects ones crossing its edges (local time)', () => {
    // Mon 2026-06-01, Berlin CEST (UTC+2): 09:00-17:00 local = 07:00-15:00Z
    expect(isWithinBookableHours(office, BERLIN, d('2026-06-01T07:00:00Z'), d('2026-06-01T15:00:00Z'))).toBe(true);
    expect(isWithinBookableHours(office, BERLIN, d('2026-06-01T06:45:00Z'), d('2026-06-01T08:00:00Z'))).toBe(false);
    expect(isWithinBookableHours(office, BERLIN, d('2026-06-01T14:00:00Z'), d('2026-06-01T15:15:00Z'))).toBe(false);
  });

  it('closes weekdays without ranges once any weekday has ranges', () => {
    // Saturday 2026-06-06
    expect(isWithinBookableHours(office, BERLIN, d('2026-06-06T08:00:00Z'), d('2026-06-06T09:00:00Z'))).toBe(false);
  });

  it('supports several ranges per day but not spanning the gap', () => {
    const split = weekdays([
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ]);
    expect(isWithinBookableHours(split, BERLIN, d('2026-06-01T07:00:00Z'), d('2026-06-01T09:00:00Z'))).toBe(true);
    expect(isWithinBookableHours(split, BERLIN, d('2026-06-01T09:00:00Z'), d('2026-06-01T12:00:00Z'))).toBe(false);
  });

  it('joins a range ending at 24:00 with the next day starting at 00:00', () => {
    const night: BookableHours = {
      mon: [{ start: '18:00', end: '24:00' }],
      tue: [{ start: '00:00', end: '06:00' }],
    };
    // Mon 22:00 -> Tue 02:00 local (CEST): 20:00Z -> 00:00Z
    expect(isWithinBookableHours(night, BERLIN, d('2026-06-01T20:00:00Z'), d('2026-06-02T00:00:00Z'))).toBe(true);
    // Tue 05:00 -> 07:00 local runs past 06:00
    expect(isWithinBookableHours(night, BERLIN, d('2026-06-02T03:00:00Z'), d('2026-06-02T05:00:00Z'))).toBe(false);
    expect(bookableIntervals(night, BERLIN, d('2026-06-01T00:00:00Z'), d('2026-06-02T12:00:00Z'))).toHaveLength(1);
  });

  it('does not join 23:59 with 00:00', () => {
    const gap: BookableHours = { mon: [{ start: '18:00', end: '23:59' }], tue: [{ start: '00:00', end: '06:00' }] };
    expect(isWithinBookableHours(gap, BERLIN, d('2026-06-01T21:30:00Z'), d('2026-06-01T22:30:00Z'))).toBe(false);
  });

  it('evaluates ranges in local wall-clock time on DST days', () => {
    // Sunday 2026-03-29 (spring forward). Range 00:00-24:00 is a 23 hour interval: 23:00Z(28th) -> 22:00Z.
    const sunday: BookableHours = { sun: [{ start: '00:00', end: '24:00' }] };
    expect(isWithinBookableHours(sunday, BERLIN, d('2026-03-28T23:00:00Z'), d('2026-03-29T22:00:00Z'))).toBe(true);
    expect(isWithinBookableHours(sunday, BERLIN, d('2026-03-28T22:00:00Z'), d('2026-03-29T00:00:00Z'))).toBe(false);
    // 09:00-17:00 on the DST day: before the switch it is UTC+1, after UTC+2 -> 08:00Z..15:00Z
    const day: BookableHours = { sun: [{ start: '09:00', end: '17:00' }] };
    expect(isWithinBookableHours(day, BERLIN, d('2026-03-29T07:00:00Z'), d('2026-03-29T15:00:00Z'))).toBe(true);
    expect(isWithinBookableHours(day, BERLIN, d('2026-03-29T08:00:00Z'), d('2026-03-29T15:30:00Z'))).toBe(false);
    // Autumn: Sunday 2026-10-25 is 25 hours long, 09:00-17:00 local = 08:00Z-16:00Z (UTC+1 by then)
    expect(isWithinBookableHours(day, BERLIN, d('2026-10-25T08:00:00Z'), d('2026-10-25T16:00:00Z'))).toBe(true);
    expect(isWithinBookableHours(day, BERLIN, d('2026-10-25T07:00:00Z'), d('2026-10-25T09:00:00Z'))).toBe(false);
  });

  it('validates the structure', () => {
    expect(
      validateBookableHours({ mon: [{ start: '09:00', end: '17:00' }], sat: [{ start: '10:00', end: '24:00' }] }),
    ).toEqual([]);
    expect(validateBookableHours(null)).toHaveLength(1);
    expect(validateBookableHours({ funday: [] })[0].message).toMatch(/unknown weekday/);
    expect(validateBookableHours({ mon: [{ start: '17:00', end: '09:00' }] })).toHaveLength(1);
    expect(validateBookableHours({ mon: [{ start: '9:00', end: '17:00' }] })).toHaveLength(1);
    expect(validateBookableHours({ mon: [{ start: '24:00', end: '24:00' }] })).toHaveLength(1);
    expect(
      validateBookableHours({
        mon: [
          { start: '09:00', end: '12:00' },
          { start: '11:00', end: '13:00' },
        ],
      })[0].message,
    ).toMatch(/overlap/);
    expect(validateBookableHours({ mon: 'x' })).toHaveLength(1);
  });
});
