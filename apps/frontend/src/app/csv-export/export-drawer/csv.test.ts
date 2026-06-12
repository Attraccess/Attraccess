import { describe, expect, it } from 'vitest';
import { buildCsv, escapeCsvValue } from './csv';

describe('escapeCsvValue', () => {
  it('returns plain values unchanged', () => {
    expect(escapeCsvValue('hello')).toBe('hello');
    expect(escapeCsvValue('')).toBe('');
  });

  it('quotes values containing the separator', () => {
    expect(escapeCsvValue('a;b')).toBe('"a;b"');
  });

  it('quotes and doubles embedded quotes', () => {
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes values containing line breaks', () => {
    expect(escapeCsvValue('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvValue('line1\r\nline2')).toBe('"line1\r\nline2"');
  });
});

describe('buildCsv', () => {
  it('builds header and rows in column order', () => {
    const csv = buildCsv(
      [
        { header: 'Name', getValue: (i) => ['Anna', 'Bert'][i] },
        { header: 'Org', getValue: () => 'makerspace' },
      ],
      2,
    );

    expect(csv).toBe('Name;Org\nAnna;makerspace\nBert;makerspace');
  });

  it('escapes headers and values', () => {
    const csv = buildCsv([{ header: 'a;b', getValue: () => 'x"y' }], 1);

    expect(csv).toBe('"a;b"\n"x""y"');
  });

  it('outputs only the header row when there are no rows', () => {
    expect(buildCsv([{ header: 'Name', getValue: () => '' }], 0)).toBe('Name');
  });
});
