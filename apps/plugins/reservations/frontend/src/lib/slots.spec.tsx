import { describe, expect, it } from 'vitest';
import { checkWindow, validDurations, validStarts, type SlotContext } from './slots';
import { wallClockToDate } from './time';
import type { BookingRules, Reservation } from './types';
import { validateSettingsForm } from './validation';

const ZONE = 'Europe/Berlin';
const rules: BookingRules = {
  approvalRequired: false,
  timeStepMinutes: 15,
  minDurationMinutes: 30,
  maxDurationMinutes: 120,
  maxAdvanceDays: 60,
  minLeadMinutes: 0,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  maxActiveBookingsPerUser: 3,
  whoCanBook: 'can-start',
  checkInEnabled: true,
  checkInGraceMinutes: 15,
  earlyCheckInMinutes: 15,
  bookableHours: {},
};
const at = (day: number, hour: number, minute = 0, month = 6) =>
  wallClockToDate({ year: 2030, month, day, hour, minute }, ZONE);
const now = at(1, 8);

const reservation = (start: Date, end: Date, extra: Partial<Reservation> = {}): Reservation =>
  ({
    id: 1,
    resourceId: 1,
    resourceName: 'Laser',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    status: 'confirmed',
    mine: false,
    ...extra,
  }) as Reservation;

const context = (extra: Partial<SlotContext> = {}): SlotContext => ({
  rules,
  timezone: ZONE,
  reservations: [],
  maintenance: [],
  now,
  ...extra,
});

describe('checkWindow', () => {
  it('accepts a free, on-grid window and reports each violated rule', () => {
    expect(checkWindow(context(), at(2, 10), at(2, 11))).toBeNull();
    expect(checkWindow(context(), at(1, 7), at(1, 8))).toBe('IN_THE_PAST');
    expect(checkWindow(context(), at(2, 10, 5), at(2, 11, 5))).toBe('OFF_TIME_STEP');
    expect(checkWindow(context(), at(2, 10), at(2, 10, 15))).toBe('DURATION_TOO_SHORT');
    expect(checkWindow(context(), at(2, 10), at(2, 13))).toBe('DURATION_TOO_LONG');
    expect(checkWindow(context(), at(1, 8, 15), at(1, 9)) === null).toBe(true);
  });

  it('enforces advance and lead time', () => {
    expect(checkWindow(context(), at(1, 10, 0, 12), at(1, 11, 0, 12))).toBe('BEYOND_MAX_ADVANCE');
    const lead = context({ rules: { ...rules, minLeadMinutes: 120 } });
    expect(checkWindow(lead, at(1, 9), at(1, 10))).toBe('LEAD_TIME_TOO_SHORT');
    expect(checkWindow(lead, at(1, 11), at(1, 12))).toBeNull();
  });

  it('checks bookable hours including the buffers', () => {
    const hours = { ...rules, bookableHours: { mon: [{ start: '09:00', end: '17:00' }] } };
    // 2030-07-01 is a Monday
    const ctx = context({ rules: { ...hours, bufferBeforeMinutes: 30 }, now: at(1, 0, 0, 7) });
    const day = (hour: number, minute = 0) => at(1, hour, minute, 7);
    expect(checkWindow(ctx, day(10), day(11))).toBeNull();
    expect(checkWindow(ctx, day(9), day(10))).toBe('OUTSIDE_BOOKABLE_HOURS');
    expect(checkWindow(ctx, day(16), day(17, 30))).toBe('OUTSIDE_BOOKABLE_HOURS');
    expect(checkWindow(ctx, at(2, 10, 0, 7), at(2, 11, 0, 7))).toBe('OUTSIDE_BOOKABLE_HOURS');
  });

  it('joins a range ending at 24:00 with the next day starting at 00:00', () => {
    const ctx = context({
      rules: {
        ...rules,
        bookableHours: { mon: [{ start: '20:00', end: '24:00' }], tue: [{ start: '00:00', end: '06:00' }] },
      },
      now: at(1, 0, 0, 7),
    });
    expect(checkWindow(ctx, at(1, 23, 0, 7), at(2, 1, 0, 7))).toBeNull();
  });

  it('does not join ranges that touch on the same day, like the server', () => {
    const ctx = context({
      rules: {
        ...rules,
        bookableHours: {
          mon: [
            { start: '08:00', end: '12:00' },
            { start: '12:00', end: '16:00' },
          ],
        },
      },
      now: at(1, 0, 0, 7),
    });
    expect(checkWindow(ctx, at(1, 10, 0, 7), at(1, 12, 0, 7))).toBeNull();
    expect(checkWindow(ctx, at(1, 12, 0, 7), at(1, 13, 0, 7))).toBeNull();
    expect(checkWindow(ctx, at(1, 11, 0, 7), at(1, 13, 0, 7))).toBe('OUTSIDE_BOOKABLE_HOURS');
  });

  it('does not join a range ending 24:00 with a next-day range that starts later than 00:00', () => {
    const ctx = context({
      rules: {
        ...rules,
        bookableHours: { mon: [{ start: '20:00', end: '24:00' }], tue: [{ start: '00:30', end: '06:00' }] },
      },
      now: at(1, 0, 0, 7),
    });
    expect(checkWindow(ctx, at(1, 23, 0, 7), at(2, 1, 0, 7))).toBe('OUTSIDE_BOOKABLE_HOURS');
  });

  it('keeps the buffers clear of maintenance, like the server', () => {
    const maintenance = [{ startTime: at(2, 12).toISOString(), endTime: at(2, 13).toISOString() }];
    const buffered = context({ rules: { ...rules, bufferBeforeMinutes: 30, bufferAfterMinutes: 30 }, maintenance });
    expect(checkWindow(buffered, at(2, 11), at(2, 11, 45))).toBe('MAINTENANCE');
    expect(checkWindow(buffered, at(2, 13, 15), at(2, 14))).toBe('MAINTENANCE');
    expect(checkWindow(buffered, at(2, 10), at(2, 11, 30))).toBeNull();
    expect(checkWindow(buffered, at(2, 13, 30), at(2, 14, 30))).toBeNull();
    expect(checkWindow(context({ maintenance }), at(2, 11), at(2, 12))).toBeNull();
  });

  it('detects overlaps with buffers of both bookings, and maintenance', () => {
    const other = reservation(at(2, 12), at(2, 13), { bufferAfterMinutes: 30 });
    const ctx = context({ reservations: [other] });
    expect(checkWindow(ctx, at(2, 11), at(2, 12))).toBeNull();
    expect(checkWindow(ctx, at(2, 11), at(2, 12, 30))).toBe('OVERLAP');
    expect(checkWindow(ctx, at(2, 13), at(2, 14))).toBe('OVERLAP');
    expect(checkWindow(ctx, at(2, 13, 30), at(2, 14, 30))).toBeNull();
    const cancelled = context({ reservations: [{ ...other, status: 'cancelled' }] });
    expect(checkWindow(cancelled, at(2, 12), at(2, 13))).toBeNull();
    const maintenance = context({ maintenance: [{ startTime: at(3, 9).toISOString(), endTime: null }] });
    expect(checkWindow(maintenance, at(3, 10), at(3, 11))).toBe('MAINTENANCE');
    expect(checkWindow(maintenance, at(2, 10), at(2, 11))).toBeNull();
  });
});

describe('validStarts and validDurations', () => {
  it('offers only starts that allow the minimum duration, and durations up to the next booking', () => {
    const ctx = context({ reservations: [reservation(at(2, 12), at(2, 13))] });
    const starts = validStarts(ctx, { year: 2030, month: 6, day: 2 });
    const hhmm = starts.map((s) => s.getTime());
    expect(hhmm).toContain(at(2, 11).getTime());
    expect(hhmm).not.toContain(at(2, 11, 45).getTime());
    expect(hhmm).not.toContain(at(2, 12).getTime());
    expect(validDurations(ctx, at(2, 11))).toEqual([30, 45, 60]);
    expect(validDurations(ctx, at(2, 9))).toEqual([30, 45, 60, 75, 90, 105, 120]);
  });

  it('keeps the time grid in local time across the spring DST change', () => {
    // Europe/Berlin springs forward on 2030-03-31: 02:00 -> 03:00, a 23 hour day.
    const ctx = context({ now: wallClockToDate({ year: 2030, month: 3, day: 30, hour: 0 }, ZONE) });
    const starts = validStarts(ctx, { year: 2030, month: 3, day: 31 });
    const local = starts.map((s) =>
      new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
        s,
      ),
    );
    expect(local).toContain('01:45');
    expect(local).not.toContain('02:00');
    expect(local).not.toContain('02:30');
    expect(local).toContain('03:00');
    expect(new Set(local).size).toBe(local.length);
  });
});

describe('validateSettingsForm', () => {
  const values = {
    enabled: true,
    approvalRequired: false,
    timeStepMinutes: 15,
    minDurationMinutes: 15,
    maxDurationMinutes: 240,
    maxAdvanceDays: 30,
    minLeadMinutes: 0,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    maxActiveBookingsPerUser: 3,
    whoCanBook: 'can-start' as const,
    confirmWindowMinutes: 60,
    checkInEnabled: true,
    checkInGraceMinutes: 15,
    earlyCheckInMinutes: 15,
    handoverReminderMinutes: 15,
    bookableHours: {},
  };

  it('accepts the defaults and mirrors the API ranges', () => {
    expect(validateSettingsForm(values)).toEqual({});
    expect(validateSettingsForm({ ...values, confirmWindowMinutes: 1441 }).confirmWindowMinutes).toBe('range');
    expect(validateSettingsForm({ ...values, checkInGraceMinutes: 0 }).checkInGraceMinutes).toBe('range');
    expect(validateSettingsForm({ ...values, timeStepMinutes: 7 }).timeStepMinutes).toBe('stepDividesDay');
    expect(validateSettingsForm({ ...values, minDurationMinutes: 30, maxDurationMinutes: 15 }).maxDurationMinutes).toBe(
      'maxBelowMin',
    );
    expect(validateSettingsForm({ ...values, minDurationMinutes: 20 }).minDurationMinutes).toBe('multipleOfStep');
  });

  it('validates bookable hour ranges', () => {
    const bad = (range: { start: string; end: string }[]) =>
      validateSettingsForm({ ...values, bookableHours: { mon: range } })['bookableHours.mon'];
    expect(bad([{ start: '09:00', end: '24:00' }])).toBeUndefined();
    expect(bad([{ start: '9', end: '17:00' }])).toBe('timeFormat');
    expect(bad([{ start: '10:00', end: '09:00' }])).toBe('endAfterStart');
    expect(
      bad([
        { start: '08:00', end: '12:00' },
        { start: '11:00', end: '13:00' },
      ]),
    ).toBe('overlap');
  });
});
