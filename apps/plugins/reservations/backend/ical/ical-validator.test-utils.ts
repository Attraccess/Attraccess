/** Strict structural RFC 5545 validator for the plugin's feeds (no iCalendar parser is available in the workspace). */

export interface ParsedEvent {
  uid: string;
  dtstamp: string;
  dtstart: string;
  dtend: string;
  summary: string;
  status: string;
  description?: string;
}

export interface ParsedCalendar {
  props: Record<string, string>;
  events: ParsedEvent[];
}

const DATE_TIME = /^\d{8}T\d{6}Z$/;
const CONTENT_LINE = /^([A-Za-z0-9-]+)((?:;[A-Za-z0-9-]+=(?:"[^"]*"|[^;:,"]*)(?:,(?:"[^"]*"|[^;:,"]*))*)*):(.*)$/;

export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

export function parseIcalDate(value: string): Date {
  return new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`,
  );
}

export function validateIcal(source: string): ParsedCalendar {
  if (!source.endsWith('\r\n')) throw new Error('must end with CRLF');
  if (/(^|[^\r])\n/.test(source)) throw new Error('bare LF found');
  const physical = source.slice(0, -2).split('\r\n');
  const logical: string[] = [];
  for (const line of physical) {
    if (Buffer.byteLength(line, 'utf8') > 75) throw new Error(`line longer than 75 octets: ${line}`);
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (logical.length === 0) throw new Error('continuation without a line');
      logical[logical.length - 1] += line.slice(1);
    } else {
      logical.push(line);
    }
  }
  // Folding must not have split a UTF-8 sequence (decoding the joined text would show U+FFFD).
  for (const line of logical) {
    if (line.includes('�')) throw new Error('broken UTF-8 sequence');
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000a-\u001f\u007f]/.test(line)) throw new Error(`control character in: ${line}`);
  }
  const stack: string[] = [];
  const calendar: ParsedCalendar = { props: {}, events: [] };
  let event: Partial<ParsedEvent> | null = null;
  const uids = new Set<string>();
  for (const line of logical) {
    const match = CONTENT_LINE.exec(line);
    if (!match) throw new Error(`invalid content line: ${line}`);
    const [, rawName, , value] = match;
    const name = rawName.toUpperCase();
    if (name === 'BEGIN') {
      stack.push(value);
      if (value === 'VEVENT') event = {};
      else if (stack.length === 1 && value !== 'VCALENDAR') throw new Error('root must be VCALENDAR');
      else if (value !== 'VCALENDAR') throw new Error(`unexpected component ${value}`);
      continue;
    }
    if (name === 'END') {
      if (stack.pop() !== value) throw new Error(`mismatched END:${value}`);
      if (value === 'VEVENT') {
        const e = event as ParsedEvent;
        for (const required of ['uid', 'dtstamp', 'dtstart', 'dtend', 'summary', 'status'] as const) {
          if (!e[required]) throw new Error(`VEVENT missing ${required}`);
        }
        for (const key of ['dtstamp', 'dtstart', 'dtend'] as const) {
          if (!DATE_TIME.test(e[key])) throw new Error(`invalid ${key}: ${e[key]}`);
        }
        if (parseIcalDate(e.dtend) <= parseIcalDate(e.dtstart)) throw new Error('DTEND must be after DTSTART');
        if (!['CONFIRMED', 'TENTATIVE', 'CANCELLED'].includes(e.status)) throw new Error('invalid STATUS');
        if (uids.has(e.uid)) throw new Error(`duplicate UID ${e.uid}`);
        uids.add(e.uid);
        calendar.events.push(e);
        event = null;
      }
      continue;
    }
    if (/\\(?![\\;,nN])/.test(value) && ['SUMMARY', 'DESCRIPTION', 'X-WR-CALNAME'].includes(name)) {
      throw new Error(`invalid escape in ${name}`);
    }
    if (event) {
      if (['UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'SUMMARY', 'STATUS', 'DESCRIPTION'].includes(name)) {
        const key = name.toLowerCase() as keyof ParsedEvent;
        if (event[key] !== undefined) throw new Error(`duplicate ${name}`);
        event[key] = ['SUMMARY', 'DESCRIPTION'].includes(name) ? unescapeText(value) : value;
      }
    } else if (stack.length === 1) {
      calendar.props[name] = value;
    }
  }
  if (stack.length !== 0) throw new Error('unclosed component');
  if (logical[0] !== 'BEGIN:VCALENDAR' || logical[logical.length - 1] !== 'END:VCALENDAR') {
    throw new Error('must be one VCALENDAR');
  }
  if (calendar.props['VERSION'] !== '2.0') throw new Error('VERSION:2.0 required');
  if (!calendar.props['PRODID']) throw new Error('PRODID required');
  return calendar;
}
