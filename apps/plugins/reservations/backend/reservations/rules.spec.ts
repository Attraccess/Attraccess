import { DEFAULT_SETTINGS, ResourceSettings } from '../settings/settings.model';
import { blockedSpan, checkBookingRules, spansOverlap } from './rules';

const settings = (patch: Partial<ResourceSettings> = {}): ResourceSettings => ({
  resourceId: 1,
  ...DEFAULT_SETTINGS,
  enabled: true,
  ...patch,
});
const now = new Date('2026-06-01T08:00:00Z'); // 10:00 Berlin
const check = (patch: Partial<ResourceSettings>, start: string, end: string, zone = 'Europe/Berlin') =>
  checkBookingRules({ settings: settings(patch), timeZone: zone, start: new Date(start), end: new Date(end), now })
    ?.code ?? null;

describe('checkBookingRules', () => {
  it('accepts a valid booking', () => {
    expect(check({}, '2026-06-02T08:00:00Z', '2026-06-02T09:00:00Z')).toBeNull();
  });

  it('rejects inverted and empty ranges', () => {
    expect(check({}, '2026-06-02T09:00:00Z', '2026-06-02T08:00:00Z')).toBe('INVALID_RANGE');
    expect(check({}, '2026-06-02T09:00:00Z', '2026-06-02T09:00:00Z')).toBe('INVALID_RANGE');
  });

  it('rejects the past, with a one minute tolerance', () => {
    expect(check({}, '2026-06-01T07:00:00Z', '2026-06-01T09:00:00Z')).toBe('IN_THE_PAST');
    expect(check({}, '2026-06-01T07:59:30Z', '2026-06-01T09:00:00Z')).not.toBe('IN_THE_PAST');
  });

  it('snaps start and duration to the step grid in local time', () => {
    expect(check({ timeStepMinutes: 30 }, '2026-06-02T08:15:00Z', '2026-06-02T09:15:00Z')).toBe('OFF_TIME_STEP');
    expect(check({ timeStepMinutes: 30, minDurationMinutes: 30 }, '2026-06-02T08:30:00Z', '2026-06-02T09:15:00Z')).toBe(
      'OFF_TIME_STEP',
    );
    expect(check({ timeStepMinutes: 30 }, '2026-06-02T08:00:00Z', '2026-06-02T09:30:00Z')).toBeNull();
    // seconds are off-grid
    expect(check({}, '2026-06-02T08:00:30Z', '2026-06-02T09:00:30Z')).toBe('OFF_TIME_STEP');
    // a 30 minute offset zone shifts the grid: Kolkata is UTC+5:30, 08:00Z = 13:30 local
    expect(check({ timeStepMinutes: 60 }, '2026-06-02T08:00:00Z', '2026-06-02T09:00:00Z', 'Asia/Kolkata')).toBe(
      'OFF_TIME_STEP',
    );
    expect(check({ timeStepMinutes: 60 }, '2026-06-02T07:30:00Z', '2026-06-02T08:30:00Z', 'Asia/Kolkata')).toBeNull();
  });

  it('enforces min and max duration', () => {
    expect(check({ minDurationMinutes: 60 }, '2026-06-02T08:00:00Z', '2026-06-02T08:30:00Z')).toBe(
      'DURATION_TOO_SHORT',
    );
    expect(check({ maxDurationMinutes: 60 }, '2026-06-02T08:00:00Z', '2026-06-02T09:15:00Z')).toBe('DURATION_TOO_LONG');
    expect(check({ maxDurationMinutes: 60 }, '2026-06-02T08:00:00Z', '2026-06-02T09:00:00Z')).toBeNull();
  });

  it('enforces the advance window and lead time', () => {
    expect(check({ maxAdvanceDays: 2 }, '2026-06-04T08:00:00Z', '2026-06-04T09:00:00Z')).toBe('BEYOND_MAX_ADVANCE');
    expect(check({ maxAdvanceDays: 2 }, '2026-06-03T08:00:00Z', '2026-06-03T09:00:00Z')).toBeNull();
    expect(check({ minLeadMinutes: 120 }, '2026-06-01T09:00:00Z', '2026-06-01T10:00:00Z')).toBe('LEAD_TIME_TOO_SHORT');
    expect(check({ minLeadMinutes: 120 }, '2026-06-01T10:00:00Z', '2026-06-01T11:00:00Z')).toBeNull();
    // lead 0 means "up to the start"
    expect(check({ minLeadMinutes: 0 }, '2026-06-01T08:00:00Z', '2026-06-01T09:00:00Z')).toBeNull();
    // a start that the server clock has just passed still books "now" (the tolerance wins over a zero lead)
    expect(
      checkBookingRules({
        settings: settings({ minLeadMinutes: 0 }),
        timeZone: 'Europe/Berlin',
        start: new Date('2026-06-01T08:00:00Z'),
        end: new Date('2026-06-01T09:00:00Z'),
        now: new Date('2026-06-01T08:00:20Z'),
      }),
    ).toBeNull();
  });

  it('checks bookable hours including the buffers', () => {
    const hours = { tue: [{ start: '10:00', end: '12:00' }] };
    // Tue 10:00-11:00 Berlin = 08:00-09:00Z
    expect(check({ bookableHours: hours }, '2026-06-02T08:00:00Z', '2026-06-02T09:00:00Z')).toBeNull();
    expect(
      check({ bookableHours: hours, bufferBeforeMinutes: 15 }, '2026-06-02T08:00:00Z', '2026-06-02T09:00:00Z'),
    ).toBe('OUTSIDE_BOOKABLE_HOURS');
    expect(
      check({ bookableHours: hours, bufferAfterMinutes: 60 }, '2026-06-02T09:00:00Z', '2026-06-02T09:30:00Z'),
    ).toBe('OUTSIDE_BOOKABLE_HOURS');
  });

  it('computes buffered spans and overlap', () => {
    const a = blockedSpan({
      startTime: new Date('2026-06-02T08:00:00Z'),
      endTime: new Date('2026-06-02T09:00:00Z'),
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 30,
    });
    expect(a.start.toISOString()).toBe('2026-06-02T07:45:00.000Z');
    expect(a.end.toISOString()).toBe('2026-06-02T09:30:00.000Z');
    const touching = { start: new Date('2026-06-02T09:30:00Z'), end: new Date('2026-06-02T10:00:00Z') };
    expect(spansOverlap(a, touching)).toBe(false);
    expect(spansOverlap(a, { ...touching, start: new Date('2026-06-02T09:29:00Z') })).toBe(true);
  });
});
