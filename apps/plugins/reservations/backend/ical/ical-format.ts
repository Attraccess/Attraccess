/** RFC 5545 serialisation helpers (pure). */

const CRLF = '\r\n';
const MAX_OCTETS = 75;

/** TEXT escaping: backslash, semicolon, comma, newlines; other control characters are dropped. */
export function escapeText(value: string): string {
  return (
    value
      .replace(/\r\n|\r|\n/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
  );
}

/** `20260601T120000Z` */
export function formatUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/** Folds a content line at 75 octets (CRLF + space continuation), never splitting a UTF-8 sequence. */
export function foldLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= MAX_OCTETS) return line;
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  let limit = MAX_OCTETS;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 1; // the leading space of a continuation line
      limit = MAX_OCTETS;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

export interface IcalEvent {
  uid: string;
  start: Date;
  end: Date;
  stamp: Date;
  summary: string;
  description?: string;
  status: 'CONFIRMED' | 'TENTATIVE';
}

export interface IcalCalendar {
  name: string;
  timeZone: string;
  events: IcalEvent[];
}

/** A complete VCALENDAR (CRLF line endings, folded lines, UTC times). */
export function buildCalendar(calendar: IcalCalendar): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Attraccess//Reservations//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendar.name)}`,
    `X-WR-TIMEZONE:${escapeText(calendar.timeZone)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const event of calendar.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${formatUtc(event.stamp)}`,
      `DTSTART:${formatUtc(event.start)}`,
      `DTEND:${formatUtc(event.end)}`,
      `SUMMARY:${escapeText(event.summary)}`,
      ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
      `STATUS:${event.status}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}
