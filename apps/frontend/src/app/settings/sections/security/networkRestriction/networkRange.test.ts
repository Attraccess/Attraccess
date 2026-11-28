import { describe, expect, it } from 'vitest';
import { canonicalRange, containsRange, isCoveredBy, isValidRange, splitRangeInput } from './networkRange';

describe('isValidRange', () => {
  it.each(['10.0.0.0/8', '192.168.1.5', '::1/128', 'fc00::/7', '2001:db8::1', '255.255.255.255/32'])(
    'accepts %s',
    (entry) => expect(isValidRange(entry)).toBe(true),
  );
  // Zone ids are refused: they mean nothing for callers on other hosts. The server would accept them.
  it.each([
    '',
    'nope',
    '10.0.0.0/33',
    '10.0.0.256',
    '::1/129',
    '10.0.0.0/8/1',
    '1.2.3',
    'fc00::/-1',
    'g::1',
    ' ::1',
    'fe80::1%eth0',
  ])('rejects %s', (entry) => expect(isValidRange(entry)).toBe(false));
});

describe('splitRangeInput', () => {
  it('splits on commas, semicolons and whitespace', () => {
    expect(splitRangeInput('10.0.0.0/8, fc00::/7;\n::1/128  ')).toEqual(['10.0.0.0/8', 'fc00::/7', '::1/128']);
  });
});

describe('canonicalRange and containsRange', () => {
  it.each([
    ['10.0.0.1/8', '10.0.0.0/8'],
    ['10.0.0.5', '10.0.0.5/32'],
    ['FC00::/7', 'fc00::/7'],
    ['0:0:0:0:0:0:0:1', '::1/128'],
    ['2001:DB8:0:0::/32', '2001:db8::/32'],
    ['fc00::1/7', 'fc00::/7'],
    ['1.2.3.4/0', '0.0.0.0/0'],
    ['2001:db8::1/0', '::/0'],
    ['::ffff:10.0.0.1', '10.0.0.1'],
  ])('treats %s and %s as one range', (a, b) => {
    expect(canonicalRange(a)).toBe(canonicalRange(b));
    expect(containsRange([b], a)).toBe(true);
  });

  it('tells different ranges apart', () => {
    expect(containsRange(['10.0.0.0/8'], '10.0.0.0/16')).toBe(false);
    expect(containsRange(['192.168.0.0/16'], '192.168.1.0/24')).toBe(false);
    expect(containsRange([], '::1')).toBe(false);
    // A mapped range stays IPv6, as on the server.
    expect(containsRange(['10.0.0.0/8'], '::ffff:10.0.0.0/104')).toBe(false);
    expect(containsRange(['0.0.0.0/0'], '::/0')).toBe(false);
  });
});

describe('isCoveredBy', () => {
  it('finds a range or address within a broader entry of the same family', () => {
    expect(isCoveredBy(['10.0.0.0/8'], '10.20.0.0/16')).toBe(true);
    expect(isCoveredBy(['127.0.0.0/8'], '127.0.0.1')).toBe(true);
    expect(isCoveredBy(['fc00::/7'], 'fd12:3456::/48')).toBe(true);
    expect(isCoveredBy(['10.0.0.0/8'], '10.0.0.0/8')).toBe(true);
  });

  it('does not count a narrower entry or another family', () => {
    expect(isCoveredBy(['10.1.0.0/16'], '10.0.0.0/8')).toBe(false);
    expect(isCoveredBy(['::/0'], '10.0.0.1')).toBe(false);
    expect(isCoveredBy(['192.168.1.0/24'], '192.168.2.0/24')).toBe(false);
  });
});
