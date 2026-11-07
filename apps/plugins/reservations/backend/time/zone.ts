// Timezone arithmetic on top of the platform `Intl` database (the repo ships no
// timezone library, and Node bundles full ICU). Every function is DST-safe:
// instants are UTC `Date`s, wall-clock values only exist as explicit tuples.

export interface WallClock {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface LocalDate {
  year: number;
  month: number;
  day: number;
}

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

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The server's configured timezone, falling back to UTC. */
export function serverTimeZone(): string {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimeZone(resolved) ? resolved : 'UTC';
}

/** Wall-clock fields of the instant as seen in the timezone. */
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

/** Offset (local wall clock minus UTC) in milliseconds at the instant. */
export function offsetMs(date: Date, timeZone: string): number {
  const wall = getWallClock(date, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const DAY_MS = 86_400_000;

function wallOf(date: Date, timeZone: string): number {
  const wall = getWallClock(date, timeZone);
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}

/**
 * Converts a local wall-clock time to the UTC instant. Hour 24 means the next
 * local midnight. Ambiguous times (clocks set back) resolve to the first
 * occurrence; nonexistent times (clocks set forward) resolve forward by the gap.
 */
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
  return new Date(first); // nonexistent local time: shift forward by the gap
}

export function localDateOf(date: Date, timeZone: string): LocalDate {
  const { year, month, day } = getWallClock(date, timeZone);
  return { year, month, day };
}

export function addLocalDays(date: LocalDate, days: number): LocalDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

export function startOfLocalDay(date: Date, timeZone: string): Date {
  return wallClockToDate(localDateOf(date, timeZone), timeZone);
}

export function localDateKey(date: Date, timeZone: string): string {
  const { year, month, day } = localDateOf(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Wall-clock minutes since local midnight (what a user reads off the clock). */
export function localMinutesOfDay(date: Date, timeZone: string): number {
  const wall = getWallClock(date, timeZone);
  return wall.hour * 60 + wall.minute;
}

/** Whether the instant sits exactly on a whole minute. */
export function isWholeMinute(date: Date): boolean {
  return date.getTime() % 60_000 === 0;
}
