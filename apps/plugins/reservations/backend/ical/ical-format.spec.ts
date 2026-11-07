import { buildCalendar, escapeText, foldLine, formatUtc } from './ical-format';
import { validateIcal } from './ical-validator.test-utils';

describe('iCal formatting', () => {
  it('escapes TEXT values', () => {
    expect(escapeText('a,b;c\\d\ne\r\nf\u0007')).toBe('a\\,b\\;c\\\\d\\ne\\nf');
  });

  it('writes UTC date-times', () => {
    expect(formatUtc(new Date('2026-03-29T08:00:00.000Z'))).toBe('20260329T080000Z');
  });

  it('folds at 75 octets without splitting UTF-8 sequences', () => {
    const line = `SUMMARY:${'Ünïcödé 日本語 🙂 '.repeat(20)}`;
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(2);
    for (const part of parts) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((part) => part.startsWith(' '))).toBe(true);
    expect(parts.map((part, i) => (i ? part.slice(1) : part)).join('')).toBe(line);
    expect(foldLine('SHORT:line')).toBe('SHORT:line');
  });

  it('builds a calendar that passes the strict validator', () => {
    const source = buildCalendar({
      name: 'Meine Reservierungen, 2026; "alle"',
      timeZone: 'Europe/Berlin',
      events: [
        {
          uid: 'reservation-1@attraccess',
          start: new Date('2026-06-01T10:00:00Z'),
          end: new Date('2026-06-01T11:00:00Z'),
          stamp: new Date('2026-06-01T08:00:00Z'),
          summary: 'Lasercutter – Müller, Jörg',
          description: 'Zeile 1\nZeile 2; mit, Zeichen',
          status: 'TENTATIVE',
        },
      ],
    });
    expect(source.endsWith('\r\n')).toBe(true);
    const calendar = validateIcal(source);
    expect(calendar.props['X-WR-TIMEZONE']).toBe('Europe/Berlin');
    expect(calendar.events[0]).toMatchObject({
      summary: 'Lasercutter – Müller, Jörg',
      description: 'Zeile 1\nZeile 2; mit, Zeichen',
      status: 'TENTATIVE',
    });
  });

  it('the validator rejects broken calendars', () => {
    expect(() => validateIcal('BEGIN:VCALENDAR\nEND:VCALENDAR\n')).toThrow();
    expect(() => validateIcal('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n')).toThrow('PRODID');
    expect(() =>
      validateIcal(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:x\r\nX-LONG:${'a'.repeat(80)}\r\nEND:VCALENDAR\r\n`),
    ).toThrow('75');
  });
});
