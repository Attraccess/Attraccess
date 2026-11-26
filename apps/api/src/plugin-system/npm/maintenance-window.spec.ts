import { maintenanceWindowStart } from './maintenance-window';

const at = (hours: number, minutes: number, day = 26) => new Date(2026, 10, day, hours, minutes, 42, 500);

describe('maintenanceWindowStart', () => {
  const window = { startMinute: 3 * 60, durationMinutes: 120 };

  it.each([
    ['one minute before it opens', at(2, 59)],
    ['the minute it closes', at(5, 0)],
    ['in the afternoon', at(15, 0)],
  ])('is outside %s', (_label, now) => {
    expect(maintenanceWindowStart(window, now)).toBeNull();
  });

  it.each([
    ['the minute it opens', at(3, 0)],
    ['its last minute', at(4, 59)],
  ])('is inside at %s and reports when it opened', (_label, now) => {
    expect(maintenanceWindowStart(window, now)).toEqual(new Date(2026, 10, 26, 3, 0));
  });

  it('follows a window across midnight back to the previous day', () => {
    const overnight = { startMinute: 23 * 60, durationMinutes: 120 };
    expect(maintenanceWindowStart(overnight, at(0, 30, 27))).toEqual(new Date(2026, 10, 26, 23, 0));
    expect(maintenanceWindowStart(overnight, at(1, 0, 27))).toBeNull();
    expect(maintenanceWindowStart(overnight, at(22, 59))).toBeNull();
  });

  it('is always open for a window of a whole day', () => {
    const always = { startMinute: 600, durationMinutes: 24 * 60 };
    for (const now of [at(0, 0), at(9, 59), at(10, 0), at(23, 59)])
      expect(maintenanceWindowStart(always, now)).not.toBeNull();
  });

  // Jest gives each test file its own copy of process.env, so TZ cannot be switched here: these run only where the
  // process already uses a zone with Central European daylight saving time (TZ=Europe/Berlin).
  const centralEuropean = new Date(Date.UTC(2026, 2, 29, 1, 30)).getHours() === 3;
  (centralEuropean ? describe : describe.skip)('on a daylight saving change in Central Europe', () => {
    it('keeps the local start time and counts the duration in elapsed time', () => {
      // 2026-03-29: clocks go from 02:00 CET to 03:00 CEST. 03:30 CEST is 90 minutes after 01:00 CET.
      const window = { startMinute: 60, durationMinutes: 180 };
      expect(maintenanceWindowStart(window, new Date(Date.UTC(2026, 2, 29, 1, 30)))).toEqual(
        new Date(Date.UTC(2026, 2, 29, 0, 0)),
      );
      expect(maintenanceWindowStart(window, new Date(Date.UTC(2026, 2, 29, 3, 0)))).toBeNull();
    });

    it('keeps a whole-day window open on the 25-hour day', () => {
      // 2026-10-25 has 25 hours; at 01:30 UTC yesterday's 03:00 start is 24.5 hours back.
      const always = { startMinute: 180, durationMinutes: 24 * 60 };
      expect(maintenanceWindowStart(always, new Date(Date.UTC(2026, 9, 25, 1, 30)))).not.toBeNull();
    });
  });
});
