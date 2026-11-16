import { type LocalDate, addLocalDays, localDateOf, weekdayOf, wallClockToDate } from './zone';

/** Index = JS weekday (0 = Sunday). */
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Local wall-clock range, `HH:mm`; `end` may be `24:00` (joins the next day's `00:00`). */
export interface BookableRange {
  start: string;
  end: string;
}

/** Weekdays without an entry (or with an empty list) are closed unless every weekday is empty (24/7). */
export type BookableHours = Partial<Record<Weekday, BookableRange[]>>;

export interface Interval {
  start: Date;
  end: Date;
}

export const MAX_RANGES_PER_DAY = 8;
const HM = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;

export function parseHm(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function hasRestrictions(hours: BookableHours): boolean {
  return WEEKDAYS.some((day) => (hours[day]?.length ?? 0) > 0);
}

/** Returns human-readable validation errors keyed by `bookableHours.<day>`; empty when valid. */
export function validateBookableHours(input: unknown): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return [{ field: 'bookableHours', message: 'must be an object keyed by weekday' }];
  }
  for (const [day, ranges] of Object.entries(input)) {
    const field = `bookableHours.${day}`;
    if (!(WEEKDAYS as readonly string[]).includes(day)) {
      errors.push({ field, message: `unknown weekday, expected one of ${WEEKDAYS.join(', ')}` });
      continue;
    }
    if (!Array.isArray(ranges) || ranges.length > MAX_RANGES_PER_DAY) {
      errors.push({ field, message: `must be a list of at most ${MAX_RANGES_PER_DAY} ranges` });
      continue;
    }
    const parsed: [number, number][] = [];
    for (const range of ranges) {
      const start = (range as BookableRange | null)?.start;
      const end = (range as BookableRange | null)?.end;
      if (
        typeof start !== 'string' ||
        typeof end !== 'string' ||
        !HM.test(start) ||
        !HM.test(end) ||
        start === '24:00'
      ) {
        errors.push({ field, message: 'ranges need start and end as HH:mm (end may be 24:00)' });
        continue;
      }
      if (parseHm(start) >= parseHm(end)) {
        errors.push({ field, message: `range ${start}-${end} must end after it starts` });
        continue;
      }
      parsed.push([parseHm(start), parseHm(end)]);
    }
    parsed.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < parsed.length; i += 1) {
      if (parsed[i][0] < parsed[i - 1][1]) errors.push({ field, message: 'ranges must not overlap' });
    }
  }
  return errors;
}

/** Strips unknown keys and sorts the ranges of a validated structure. */
export function normalizeBookableHours(hours: BookableHours): BookableHours {
  const result: BookableHours = {};
  for (const day of WEEKDAYS) {
    const ranges = hours[day];
    if (ranges && ranges.length > 0) {
      result[day] = ranges
        .map(({ start, end }) => ({ start, end }))
        .sort((a, b) => parseHm(a.start) - parseHm(b.start));
    }
  }
  return result;
}

/**
 * Bookable UTC intervals touching [from, to]: one interval per configured range and day. Ranges are
 * never merged, not even when they touch on the same day (08:00-12:00 and 12:00-16:00 stay two ranges),
 * with one exception: a range ending at 24:00 joins the next local day's range starting at 00:00.
 * DST days simply have a 23 or 25 hour span.
 */
export function bookableIntervals(hours: BookableHours, timeZone: string, from: Date, to: Date): Interval[] {
  const first = addLocalDays(localDateOf(from, timeZone), -1);
  const last = addLocalDays(localDateOf(to, timeZone), 1);
  const raw: (Interval & { fromMidnight: boolean; toMidnight: boolean })[] = [];
  const key = (d: LocalDate) => d.year * 10000 + d.month * 100 + d.day;
  for (let day = first; key(day) <= key(last); day = addLocalDays(day, 1)) {
    for (const range of hours[WEEKDAYS[weekdayOf(day)]] ?? []) {
      const toMidnight = range.end === '24:00';
      raw.push({
        start: wallClockToDate(
          { ...day, hour: Math.floor(parseHm(range.start) / 60), minute: parseHm(range.start) % 60 },
          timeZone,
        ),
        end: toMidnight
          ? wallClockToDate(addLocalDays(day, 1), timeZone)
          : wallClockToDate(
              { ...day, hour: Math.floor(parseHm(range.end) / 60), minute: parseHm(range.end) % 60 },
              timeZone,
            ),
        fromMidnight: parseHm(range.start) === 0,
        toMidnight,
      });
    }
  }
  raw.sort((a, b) => a.start.getTime() - b.start.getTime());
  const joined: typeof raw = [];
  for (const interval of raw) {
    const previous = joined[joined.length - 1];
    const crossesMidnight =
      previous?.toMidnight && interval.fromMidnight && interval.start.getTime() === previous.end.getTime();
    if (previous && crossesMidnight) {
      previous.end = interval.end;
      previous.toMidnight = interval.toMidnight;
    } else {
      joined.push({ ...interval });
    }
  }
  return joined.map(({ start, end }) => ({ start, end }));
}

/** Whether [start, end] lies fully inside one bookable range (or a 24:00/00:00 chain of them). Unrestricted hours accept everything. */
export function isWithinBookableHours(hours: BookableHours, timeZone: string, start: Date, end: Date): boolean {
  if (!hasRestrictions(hours)) return true;
  return bookableIntervals(hours, timeZone, start, end).some(
    (interval) => interval.start.getTime() <= start.getTime() && end.getTime() <= interval.end.getTime(),
  );
}
