/**
 * Reader clock zone maths. The only place in the reader code that may read the process zone: every reader
 * payload that carries a local time offset goes through `readerOffsetMinutes`.
 */

/** Readers accept offsets in [-840, 840] minutes east of UTC. */
const MAX_OFFSET_MINUTES = 840;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

/** True for a name `Intl` knows as an IANA zone. */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.trim() === '' || zone.length > 64) return false;
  try {
    formatterFor(zone);
    return true;
  } catch {
    return false;
  }
}

/** Minutes east of UTC that `zone` observes at `at`. DST-correct, because it is computed per instant. */
export function zoneOffsetMinutes(zone: string, at: Date): number {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(zone).formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  const localAsUtc = Date.UTC(
    parts['year'],
    parts['month'] - 1,
    parts['day'],
    parts['hour'],
    parts['minute'],
    parts['second'],
  );
  const wholeSecond = Math.floor(at.getTime() / 1000) * 1000;
  return Math.max(-MAX_OFFSET_MINUTES, Math.min(MAX_OFFSET_MINUTES, Math.round((localAsUtc - wholeSecond) / 60000)));
}

/** Offset of the API process zone (`TZ`). */
export function processOffsetMinutes(at: Date): number {
  return -at.getTimezoneOffset() || 0;
}

/** The reader's offset for `at`: the reader zone when there is one, otherwise the API process zone. */
export function readerOffsetMinutes(zone: string | null | undefined, at: Date): number {
  return zone ? zoneOffsetMinutes(zone, at) : processOffsetMinutes(at);
}
