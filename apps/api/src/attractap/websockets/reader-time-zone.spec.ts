import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isValidTimeZone, readerOffsetMinutes, zoneOffsetMinutes } from './reader-time-zone';

describe('reader time zone maths', () => {
  it('computes DST-correct offsets per instant', () => {
    expect(zoneOffsetMinutes('Europe/Berlin', new Date('2026-01-15T12:00:00Z'))).toBe(60);
    expect(zoneOffsetMinutes('Europe/Berlin', new Date('2026-07-15T12:00:00Z'))).toBe(120);
    expect(zoneOffsetMinutes('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe(-240);
    expect(zoneOffsetMinutes('Asia/Kolkata', new Date('2026-07-15T12:00:00Z'))).toBe(330);
  });

  it('switches at the DST boundary', () => {
    expect(zoneOffsetMinutes('Europe/Berlin', new Date('2026-03-29T00:59:59Z'))).toBe(60);
    expect(zoneOffsetMinutes('Europe/Berlin', new Date('2026-03-29T01:00:00Z'))).toBe(120);
    expect(zoneOffsetMinutes('Europe/Berlin', new Date('2026-10-25T00:59:59Z'))).toBe(120);
    expect(zoneOffsetMinutes('Europe/Berlin', new Date('2026-10-25T01:00:00Z'))).toBe(60);
  });

  it('validates IANA names', () => {
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });

  it('uses the process zone without a reader zone', () => {
    const at = new Date('2026-07-15T12:00:00Z');
    expect(readerOffsetMinutes(null, at)).toBe(-at.getTimezoneOffset() || 0);
    expect(readerOffsetMinutes(undefined, at)).toBe(-at.getTimezoneOffset() || 0);
  });
});

describe('reader payloads', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

  it('read no zone offset except through the reader zone helper', () => {
    const root = join(__dirname, '..');
    const offenders = walk(root).filter(
      (file) =>
        file.endsWith('.ts') &&
        !file.endsWith('.spec.ts') &&
        !file.endsWith('reader-time-zone.ts') &&
        readFileSync(file, 'utf8').includes('getTimezoneOffset'),
    );
    expect(offenders).toEqual([]);
  });
});
