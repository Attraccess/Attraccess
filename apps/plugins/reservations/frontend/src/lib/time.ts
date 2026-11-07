// Timezone arithmetic for the booking UI. Mirrors the backend's rules on top of the
// platform `Intl` database; instants are UTC `Date`s, wall-clock values are explicit tuples.
import { detectLanguage } from '@attraccess/plugins-frontend-ui';

export interface LocalDate {
  year: number;
  month: number;
  day: number;
}

export interface WallClock extends LocalDate {
  hour: number;
  minute: number;
  second: number;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function getWallClock(date: Date, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(date);
  const read = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  };
}

function wallOf(date: Date, timeZone: string): number {
  const wall = getWallClock(date, timeZone);
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}

function offsetMs(date: Date, timeZone: string): number {
  return wallOf(date, timeZone) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Local wall clock -> UTC instant. Ambiguous times take the first occurrence, gaps shift forward. */
export function wallClockToDate(
  local: LocalDate & { hour?: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const target = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour ?? 0,
    local.minute ?? 0,
    local.second ?? 0,
  );
  const before = offsetMs(new Date(target - DAY_MS), timeZone);
  const after = offsetMs(new Date(target + DAY_MS), timeZone);
  const first = target - before;
  if (before === after || wallOf(new Date(first), timeZone) === target) return new Date(first);
  const second = target - after;
  if (wallOf(new Date(second), timeZone) === target) return new Date(second);
  return new Date(first);
}

export function localDateOf(date: Date, timeZone: string): LocalDate {
  const { year, month, day } = getWallClock(date, timeZone);
  return { year, month, day };
}

export function addLocalDays(date: LocalDate, days: number): LocalDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

export function weekdayOf(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

export function localMinutesOfDay(date: Date, timeZone: string): number {
  const wall = getWallClock(date, timeZone);
  return wall.hour * 60 + wall.minute;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** `YYYY-MM-DD`, the value format of `<input type="date">`. */
export function toDateKey(date: LocalDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

export function fromDateKey(key: string): LocalDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  return wallClockToDate(date, timeZone);
}

export function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MINUTE_MS;
}

// ---- Bookable hours ---------------------------------------------------------------------

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export interface BookableRange {
  start: string;
  end: string;
}
export type BookableHours = Partial<Record<Weekday, BookableRange[]>>;

export const parseHm = (value: string): number => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

export function hasRestrictions(hours: BookableHours): boolean {
  return WEEKDAYS.some((day) => (hours[day]?.length ?? 0) > 0);
}

interface Interval {
  start: number;
  end: number;
}

/**
 * Bookable UTC intervals around [from, to]: one per configured range and day, like the backend.
 * Ranges never merge, not even when they touch on the same day (08:00-12:00 and 12:00-16:00 stay
 * two ranges); the one exception is a range ending at 24:00, which joins the next local day's
 * range starting at 00:00.
 */
function bookableIntervals(hours: BookableHours, timeZone: string, from: Date, to: Date): Interval[] {
  const first = addLocalDays(localDateOf(from, timeZone), -1);
  const last = addLocalDays(localDateOf(to, timeZone), 1);
  const key = (d: LocalDate) => d.year * 10000 + d.month * 100 + d.day;
  const at = (day: LocalDate, minutes: number) =>
    wallClockToDate({ ...day, hour: Math.floor(minutes / 60), minute: minutes % 60 }, timeZone).getTime();
  const raw: (Interval & { fromMidnight: boolean; toMidnight: boolean })[] = [];
  for (let day = first; key(day) <= key(last); day = addLocalDays(day, 1)) {
    for (const range of hours[WEEKDAYS[weekdayOf(day)]] ?? []) {
      const toMidnight = range.end === '24:00';
      raw.push({
        start: at(day, parseHm(range.start)),
        end: toMidnight ? wallClockToDate(addLocalDays(day, 1), timeZone).getTime() : at(day, parseHm(range.end)),
        fromMidnight: parseHm(range.start) === 0,
        toMidnight,
      });
    }
  }
  raw.sort((a, b) => a.start - b.start);
  const joined: typeof raw = [];
  for (const interval of raw) {
    const previous = joined[joined.length - 1];
    if (previous?.toMidnight && interval.fromMidnight && interval.start === previous.end) {
      previous.end = interval.end;
      previous.toMidnight = interval.toMidnight;
    } else {
      joined.push({ ...interval });
    }
  }
  return joined.map(({ start, end }) => ({ start, end }));
}

/** Whether [start, end] lies fully inside one bookable range (or a 24:00/00:00 chain); unrestricted = always. */
export function isWithinBookableHours(hours: BookableHours, timeZone: string, start: Date, end: Date): boolean {
  if (!hasRestrictions(hours)) return true;
  return bookableIntervals(hours, timeZone, start, end).some(
    (interval) => interval.start <= start.getTime() && end.getTime() <= interval.end,
  );
}

// ---- Formatting -------------------------------------------------------------------------

export function formatTime(date: Date | string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

export function formatDate(date: Date | string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short', day: '2-digit', month: '2-digit' }).format(
    new Date(date),
  );
}

export function formatDateTime(date: Date | string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatDayHeading(date: LocalDate, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long', day: '2-digit', month: 'long' }).format(
    wallClockToDate({ ...date, hour: 12 }, timeZone),
  );
}

/** "1 h 15 min" in the UI language ("1 Std. 15 Min." in German). */
export function formatDuration(minutes: number, locale: string = detectLanguage()): string {
  const unit = (value: number, name: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short' }).format(value);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return unit(rest, 'minute');
  return rest === 0 ? unit(hours, 'hour') : `${unit(hours, 'hour')} ${unit(rest, 'minute')}`;
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
