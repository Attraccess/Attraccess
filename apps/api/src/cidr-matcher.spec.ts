import { createCidrMatcher, normalizeAddress, parseSubnet } from './cidr-matcher';

describe('cidr matcher', () => {
  const matches = createCidrMatcher([
    '10.0.0.0/8',
    '192.168.1.0/24',
    '203.0.113.7',
    '::1/128',
    'fc00::/7',
    'fe80::/10',
    '2001:db8::/32',
  ]);

  it.each(['10.1.2.3', '192.168.1.200', '203.0.113.7', '::1', 'fd12:3456::1', 'fe80::1', '2001:db8:abcd::5'])(
    'matches %s',
    (address) => expect(matches(address)).toBe(true),
  );

  it.each(['11.0.0.1', '192.168.2.1', '203.0.113.8', '::2', '2001:db9::1', 'not an address', ''])(
    'does not match %s',
    (address) => expect(matches(address)).toBe(false),
  );

  it('matches an IPv4-mapped IPv6 address as IPv4, in either case', () => {
    expect(matches('::ffff:10.1.2.3')).toBe(true);
    expect(matches('::FFFF:10.1.2.3')).toBe(true);
    expect(matches('::ffff:11.1.2.3')).toBe(false);
  });

  it('accepts an IPv4-mapped entry as the IPv4 address it wraps', () => {
    expect(createCidrMatcher(['::ffff:10.0.0.1'])('10.0.0.1')).toBe(true);
  });

  it('ignores entries that do not parse instead of matching everything', () => {
    const none = createCidrMatcher(['garbage', '10.0.0.0/99', '/8']);
    expect(none('10.0.0.1')).toBe(false);
  });

  it('parses and rejects subnets', () => {
    expect(parseSubnet(' 10.0.0.0/8 ')).toEqual({ address: '10.0.0.0', prefix: 8, type: 'ipv4' });
    expect(parseSubnet('fe80::/10')).toEqual({ address: 'fe80::', prefix: 10, type: 'ipv6' });
    for (const bad of ['10.0.0.0/33', '::/129', '10.0.0.0/8/8', '10.0.0.0/x', 'example.com', '10.0.0']) {
      expect(parseSubnet(bad)).toBeNull();
    }
  });

  it('normalizes only IPv4-mapped addresses', () => {
    expect(normalizeAddress('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(normalizeAddress('::ffff:zzz')).toBe('::ffff:zzz');
    expect(normalizeAddress('2001:db8::1')).toBe('2001:db8::1');
  });
});
