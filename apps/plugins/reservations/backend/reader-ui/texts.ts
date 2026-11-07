import { READER_UI_LIMITS } from '@attraccess/plugins-backend-sdk';
import type { Lang } from '../notifications/host-info.service';
import { dayKey, formatTime, LOCALES, pick } from '../notifications/format';

/** Longest holder name on a reader: the longest text around it (confirm body) still fits 80 characters. */
export const READER_NAME_MAX = 16;

const ROW_MAX = READER_UI_LIMITS.maxListRowChars;

/** Hard cut to `max` characters (no room for an ellipsis on the reader). */
export function fit(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max).trimEnd();
}

/** Punctuation and letters the host's reader sanitizer rewrites before its NFD step (same table). */
const HOST_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u2018|\u2019|\u201A|\u2032/g, "'"],
  [/\u201C|\u201D|\u201E|\u2033/g, '"'],
  [/[\u2010-\u2015]/g, '-'],
  [/[\u2009\u200A\u202F\u2002\u2003\u2007\u2008]/g, ' '],
  [/\u0142/g, 'l'],
  [/\u0141/g, 'L'],
  [/\u0111/g, 'd'],
  [/\u0110/g, 'D'],
  [/\u2026/g, '...'],
  [/\u2022/g, '-'],
  [/\u2122/g, 'TM'],
];

/**
 * A holder name as the reader may show it: Latin-1 only and at most READER_NAME_MAX characters. Letters
 * outside Latin-1 lose their accents like the host's sanitizer does ("Łukasz Šimek" → "Lukasz Simek");
 * anything else becomes "?". Doing it here keeps the length the plugin truncated to.
 */
export function readerName(name: string): string {
  const replaced = HOST_REPLACEMENTS.reduce((text, [pattern, to]) => text.replace(pattern, to), name.normalize('NFC'));
  const latin1 = Array.from(replaced)
    .map((char) => {
      if (/^[\u0020-\u007e\u00a0-\u00ff]$/.test(char)) return char;
      if (/^\s$/.test(char)) return ' ';
      const plain = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return /^[\u0020-\u007e]*$/.test(plain) ? plain : '?';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return fit(latin1, READER_NAME_MAX);
}

/** What the reader needs to write a time: language, plugin timezone and "now" (for the weekday rule). */
export interface ReaderClock {
  lang: Lang;
  timeZone: string;
  now: Date;
}

/** `14:00`, or `Tue 09:00` / `Di 09:00` when the time is on another local day than now. */
export function readerTime(date: Date, clock: ReaderClock): string {
  const time = formatTime(date, clock);
  if (dayKey(date, clock.timeZone) === dayKey(clock.now, clock.timeZone)) return time;
  const weekday = new Intl.DateTimeFormat(LOCALES[clock.lang], { timeZone: clock.timeZone, weekday: 'short' })
    .format(date)
    .replace(/\.$/, '');
  return `${weekday} ${time}`;
}

const QUARTER_HOUR_MS = 15 * 60_000;

/**
 * The next local midnight after `now` in `timeZone`: the weekday rule of {@link readerTime} changes then.
 * Starts from "24 h after today's midnight" and corrects in quarter hours (every UTC offset is a multiple
 * of 15 minutes), which covers days of 23 or 25 hours at a daylight saving change.
 */
export function nextLocalMidnight(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsed = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000 + now.getUTCMilliseconds();
  const today = dayKey(now, timeZone);
  let at = now.getTime() - elapsed + 24 * 60 * 60_000;
  while (dayKey(new Date(at), timeZone) === today) at += QUARTER_HOUR_MS;
  while (dayKey(new Date(at - QUARTER_HOUR_MS), timeZone) !== today) at -= QUARTER_HOUR_MS;
  return new Date(at);
}

const range = (start: Date, end: Date, clock: ReaderClock) => `${readerTime(start, clock)}-${readerTime(end, clock)}`;

/** Slot texts. Every function returns the final string; callers only enforce the host limits. */
export const readerTexts = {
  /** List row, ≤ 24 characters (a long weekday form falls back to the short wording). */
  rowFreeUntil: (start: Date, c: ReaderClock) =>
    fit(pick(c.lang, `Free until ${readerTime(start, c)}`, `Frei bis ${readerTime(start, c)}`), ROW_MAX),
  rowCheckInBy: (deadline: Date, c: ReaderClock) =>
    fit(pick(c.lang, `Check in by ${readerTime(deadline, c)}`, `Check-in bis ${readerTime(deadline, c)}`), ROW_MAX),
  rowReservedUntil: (end: Date, c: ReaderClock) =>
    fit(pick(c.lang, `Reserved until ${readerTime(end, c)}`, `Reserviert bis ${readerTime(end, c)}`), ROW_MAX),
  rowOwnUntil: (end: Date, c: ReaderClock) => {
    const until = readerTime(end, c);
    const long = pick(c.lang, `Your booking until ${until}`, `Deine Buchung bis ${until}`);
    return long.length <= ROW_MAX ? long : fit(pick(c.lang, `Yours until ${until}`, `Für dich bis ${until}`), ROW_MAX);
  },

  /** Details lines (≤ 80 characters; the holder name is already truncated). */
  headerFreeUntil: (start: Date, c: ReaderClock) =>
    pick(c.lang, `Free until ${readerTime(start, c)}`, `Frei bis ${readerTime(start, c)}`),
  reserved: (start: Date, end: Date, c: ReaderClock, holder?: string) =>
    holder
      ? pick(
          c.lang,
          `Reserved by ${holder} ${range(start, end, c)}`,
          `Reserviert von ${holder} ${range(start, end, c)}`,
        )
      : pick(c.lang, `Reserved ${range(start, end, c)}`, `Reserviert ${range(start, end, c)}`),
  own: (start: Date, end: Date, c: ReaderClock) =>
    pick(c.lang, `Your booking ${range(start, end, c)}`, `Deine Buchung ${range(start, end, c)}`),
  checkInSuffix: (deadline: Date, c: ReaderClock) =>
    pick(c.lang, ` - check in by ${readerTime(deadline, c)}`, ` - Check-in bis ${readerTime(deadline, c)}`),
  /** Session area: another user's booking starts soon (a countdown node follows). */
  sessionReservedFrom: (start: Date, c: ReaderClock, holder?: string) =>
    holder
      ? pick(
          c.lang,
          `Reserved by ${holder} from ${readerTime(start, c)}`,
          `Reserviert von ${holder} ab ${readerTime(start, c)}`,
        )
      : pick(c.lang, `Reserved from ${readerTime(start, c)}`, `Reserviert ab ${readerTime(start, c)}`),
};
