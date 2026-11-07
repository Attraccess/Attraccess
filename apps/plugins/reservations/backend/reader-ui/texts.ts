import { READER_UI_LIMITS } from '@attraccess/plugins-backend-sdk';
import type { Lang } from '../notifications/host-info.service';
import { formatTime, pick } from '../notifications/format';

/** Longest holder name on a reader: the longest text around it (confirm body) still fits 80 characters. */
export const READER_NAME_MAX = 16;

/** Hard cut to `max` characters (no room for an ellipsis on the reader). */
export function fit(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max).trimEnd();
}

/**
 * A holder name as the reader may show it: Latin-1 only (the host would transliterate, this keeps the
 * length predictable) and at most READER_NAME_MAX characters.
 */
export function readerName(name: string): string {
  const latin1 = name
    .normalize('NFC')
    .replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
  return fit(latin1, READER_NAME_MAX);
}

const dayKey = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

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
  const weekday = new Intl.DateTimeFormat(clock.lang === 'de' ? 'de-DE' : 'en-GB', {
    timeZone: clock.timeZone,
    weekday: 'short',
  })
    .format(date)
    .replace(/\.$/, '');
  return `${weekday} ${time}`;
}

const range = (start: Date, end: Date, clock: ReaderClock) => `${readerTime(start, clock)}-${readerTime(end, clock)}`;

/** Slot texts. Every function returns the final string; callers only enforce the host limits. */
export const readerTexts = {
  /** List row, ≤ 24 characters (a long weekday form falls back to the short wording). */
  rowFreeUntil: (start: Date, c: ReaderClock) =>
    fit(pick(c.lang, `Free until ${readerTime(start, c)}`, `Frei bis ${readerTime(start, c)}`), 24),
  rowCheckInBy: (deadline: Date, c: ReaderClock) =>
    fit(pick(c.lang, `Check in by ${readerTime(deadline, c)}`, `Check-in bis ${readerTime(deadline, c)}`), 24),
  rowReservedUntil: (end: Date, c: ReaderClock) =>
    fit(pick(c.lang, `Reserved until ${readerTime(end, c)}`, `Reserviert bis ${readerTime(end, c)}`), 24),
  rowOwnUntil: (end: Date, c: ReaderClock) => {
    const until = readerTime(end, c);
    const long = pick(c.lang, `Your booking until ${until}`, `Deine Buchung bis ${until}`);
    return long.length <= READER_UI_LIMITS.maxListRowChars
      ? long
      : fit(pick(c.lang, `Yours until ${until}`, `Deine bis ${until}`), READER_UI_LIMITS.maxListRowChars);
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
