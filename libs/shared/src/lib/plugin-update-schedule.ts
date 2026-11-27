import { CalendarDate, CalendarDateTime, fromAbsolute, toZoned } from '@internationalized/date';

/** When plugins may update themselves: chosen weekdays and one window per such day, in one IANA time zone. */
export interface PluginUpdateSchedule {
  /** ISO weekdays, 1 = Monday to 7 = Sunday, on which a window starts. A window may end on the following day. */
  weekdays: number[];
  /** Local clock time the window starts at, as a minute of the day (0 to 1439). */
  startMinute: number;
  /** Elapsed time the window stays open (1 to 1440 minutes). */
  durationMinutes: number;
  /** IANA time zone name; null when none was ever chosen, which the host reads as UTC. */
  timeZone: string | null;
}

export interface PluginUpdateWindow {
  start: Date;
  /** The first instant after the window. */
  end: Date;
}

const isoWeekday = (day: CalendarDate): number =>
  ((new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay() + 6) % 7) + 1;

/**
 * The window that starts on `day`, or null when that weekday is not chosen. The start is a local clock time, so a
 * daylight saving change does not move it. A start the zone skips that day moves forward by the skipped time, and one
 * that occurs twice means the first occurrence. The duration is elapsed time.
 */
function windowOn(schedule: PluginUpdateSchedule, day: CalendarDate): PluginUpdateWindow | null {
  if (!schedule.weekdays.includes(isoWeekday(day))) return null;
  const local = new CalendarDateTime(
    day.year,
    day.month,
    day.day,
    Math.floor(schedule.startMinute / 60),
    schedule.startMinute % 60,
  );
  const start = toZoned(local, schedule.timeZone ?? 'UTC', 'compatible').toDate();
  return { start, end: new Date(start.getTime() + schedule.durationMinutes * 60_000) };
}

/**
 * The windows starting from two days before `now` to a week ahead, in order. Two days: a day-long window that starts
 * late in the evening before a 23-hour day is still open just after the next midnight but one.
 */
function windowsAround(schedule: PluginUpdateSchedule, now: Date): PluginUpdateWindow[] {
  const local = fromAbsolute(now.getTime(), schedule.timeZone ?? 'UTC');
  const today = new CalendarDate(local.year, local.month, local.day);
  const windows: PluginUpdateWindow[] = [];
  for (let offset = -2; offset <= 8; offset += 1) {
    const window = windowOn(schedule, today.add({ days: offset }));
    if (window) windows.push(window);
  }
  return windows;
}

/** The window open at `now`, or null. Where two overlap (day-long windows), the one that started last. */
export function currentPluginUpdateWindow(schedule: PluginUpdateSchedule, now: Date): PluginUpdateWindow | null {
  const open = windowsAround(schedule, now).filter((window) => window.start <= now && now < window.end);
  return open.at(-1) ?? null;
}

/** The window open at `now`, otherwise the next one to open; null without any weekday. */
export function nextPluginUpdateWindow(schedule: PluginUpdateSchedule, now: Date): PluginUpdateWindow | null {
  return (
    currentPluginUpdateWindow(schedule, now) ??
    windowsAround(schedule, now).find((window) => window.start > now) ??
    null
  );
}
