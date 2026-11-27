import { currentPluginUpdateWindow, nextPluginUpdateWindow, PluginUpdateSchedule } from './plugin-update-schedule';

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];
const schedule = (patch: Partial<PluginUpdateSchedule> = {}): PluginUpdateSchedule => ({
  weekdays: EVERY_DAY,
  startMinute: 2 * 60,
  durationMinutes: 120,
  timeZone: 'UTC',
  ...patch,
});
const open = (value: PluginUpdateSchedule, instant: string) => currentPluginUpdateWindow(value, new Date(instant));
const span = (start: string, end: string) => ({ start: new Date(start), end: new Date(end) });

describe('plugin update schedule', () => {
  // 2026-11-30 is a Monday.
  it.each([
    ['one second before it opens', '2026-11-30T01:59:59Z', false],
    ['the instant it opens', '2026-11-30T02:00:00Z', true],
    ['its last second', '2026-11-30T03:59:59Z', true],
    ['the instant it closes', '2026-11-30T04:00:00Z', false],
  ])('at %s', (_label, instant, expected) => {
    expect(open(schedule(), instant) !== null).toBe(expected);
  });

  it('opens only on the chosen weekdays', () => {
    const weekdays = schedule({ weekdays: [1, 3] });
    expect(open(weekdays, '2026-11-30T02:30:00Z')).not.toBeNull();
    expect(open(weekdays, '2026-12-01T02:30:00Z')).toBeNull();
    expect(open(weekdays, '2026-12-02T02:30:00Z')).not.toBeNull();
    expect(open(schedule({ weekdays: [7] }), '2026-11-29T02:30:00Z')).not.toBeNull();
    expect(open(schedule({ weekdays: [] }), '2026-11-30T02:30:00Z')).toBeNull();
  });

  it('belongs to the weekday it starts on when it crosses midnight', () => {
    const mondayNight = schedule({ weekdays: [1], startMinute: 23 * 60, durationMinutes: 120 });
    expect(open(mondayNight, '2026-12-01T00:30:00Z')).toEqual(span('2026-11-30T23:00:00Z', '2026-12-01T01:00:00Z'));
    // Sunday night into Monday is Sunday's window, which is not chosen.
    expect(open(mondayNight, '2026-11-30T00:30:00Z')).toBeNull();
  });

  it('reads the clock of the chosen zone, whatever the server zone is', () => {
    const tokyo = schedule({ weekdays: [1], timeZone: 'Asia/Tokyo' });
    // Monday 02:30 in Tokyo is still Sunday in UTC.
    expect(open(tokyo, '2026-11-29T17:30:00Z')).toEqual(span('2026-11-29T17:00:00Z', '2026-11-29T19:00:00Z'));
    expect(open(tokyo, '2026-11-30T02:30:00Z')).toBeNull();
  });

  it('treats a missing zone as UTC', () => {
    expect(open(schedule({ timeZone: null }), '2026-11-30T02:30:00Z')).not.toBeNull();
  });

  describe('daylight saving time (Europe/Berlin)', () => {
    const berlin = schedule({ weekdays: [7], startMinute: 4 * 60, durationMinutes: 60, timeZone: 'Europe/Berlin' });

    it('keeps the local start time across both changes', () => {
      // Winter is UTC+1, summer UTC+2. 2027-03-28 and 2027-10-31 are the change Sundays.
      expect(nextPluginUpdateWindow(berlin, new Date('2027-03-20T12:00:00Z')).start).toEqual(
        new Date('2027-03-21T03:00:00Z'),
      );
      expect(nextPluginUpdateWindow(berlin, new Date('2027-03-27T12:00:00Z')).start).toEqual(
        new Date('2027-03-28T02:00:00Z'),
      );
      expect(nextPluginUpdateWindow(berlin, new Date('2027-10-30T12:00:00Z')).start).toEqual(
        new Date('2027-10-31T03:00:00Z'),
      );
    });

    it('moves a start the clock skips forward, and keeps the duration in elapsed time', () => {
      const skipped = { ...berlin, startMinute: 2 * 60 + 30, durationMinutes: 120 };
      // 02:30 does not exist: the window opens at 03:30 local (01:30 UTC) and lasts two real hours.
      expect(nextPluginUpdateWindow(skipped, new Date('2027-03-27T12:00:00Z'))).toEqual(
        span('2027-03-28T01:30:00Z', '2027-03-28T03:30:00Z'),
      );
    });

    it('opens once, at the first occurrence, for a start the clock repeats', () => {
      const repeated = { ...berlin, startMinute: 2 * 60 + 30, durationMinutes: 30 };
      expect(nextPluginUpdateWindow(repeated, new Date('2027-10-30T12:00:00Z'))).toEqual(
        span('2027-10-31T00:30:00Z', '2027-10-31T01:00:00Z'),
      );
      expect(open(repeated, '2027-10-31T01:45:00Z')).toBeNull();
    });
  });

  it('stays open all the time with day-long windows on every day', () => {
    const always = schedule({ startMinute: 600, durationMinutes: 1440 });
    for (const instant of ['2026-11-30T00:00:00Z', '2026-11-30T09:59:59Z', '2026-11-30T10:00:00Z'])
      expect(open(always, instant)).not.toBeNull();
  });

  it('names the open window, else the next one up to a week away', () => {
    const weekly = schedule({ weekdays: [1] });
    expect(nextPluginUpdateWindow(weekly, new Date('2026-11-30T03:00:00Z')).start).toEqual(
      new Date('2026-11-30T02:00:00Z'),
    );
    expect(nextPluginUpdateWindow(weekly, new Date('2026-11-30T04:00:00Z')).start).toEqual(
      new Date('2026-12-07T02:00:00Z'),
    );
    expect(nextPluginUpdateWindow(schedule({ weekdays: [] }), new Date())).toBeNull();
  });
});
