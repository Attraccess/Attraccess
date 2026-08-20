import { expandCidr, InvalidCidrError, isPrivateIpv4, localScanTargets } from './network-scan';

describe('expandCidr', () => {
  it('enumerates hosts without the network and broadcast addresses', () => {
    expect(expandCidr('192.168.1.0/30')).toEqual(['192.168.1.1', '192.168.1.2']);
  });

  it('masks a host address down to its network', () => {
    expect(expandCidr('192.168.1.42/30')).toEqual(['192.168.1.41', '192.168.1.42']);
  });

  it('returns 254 hosts for a /24', () => {
    const hosts = expandCidr('10.0.5.0/24');
    expect(hosts).toHaveLength(254);
    expect(hosts[0]).toBe('10.0.5.1');
    expect(hosts[253]).toBe('10.0.5.254');
  });

  it('keeps both addresses of a /31 (no broadcast by convention)', () => {
    expect(expandCidr('172.16.0.0/31')).toEqual(['172.16.0.0', '172.16.0.1']);
  });

  it('rejects public ranges — this endpoint must not become a port scanner', () => {
    expect(() => expandCidr('8.8.8.0/24')).toThrow(/only private networks/);
  });

  it('rejects subnets larger than /22', () => {
    expect(() => expandCidr('10.0.0.0/16')).toThrow(/too large/);
  });

  it('rejects malformed input', () => {
    expect(() => expandCidr('192.168.1.0')).toThrow(/not a valid IPv4 CIDR/);
    expect(() => expandCidr('192.168.1.999/24')).toThrow(/not a valid IPv4 CIDR/);
  });

  // The controller maps this type to 400 and rethrows everything else as-is.
  it('flags every rejection as operator error', () => {
    for (const bad of ['nope', '8.8.8.0/24', '10.0.0.0/16']) {
      expect(() => expandCidr(bad)).toThrow(InvalidCidrError);
    }
  });
});

describe('isPrivateIpv4', () => {
  it.each([
    ['10.1.2.3', true],
    ['172.16.0.1', true],
    ['172.32.0.1', false],
    ['192.168.0.1', true],
    ['169.254.1.1', true],
    ['1.1.1.1', false],
    ['192.168.1.1:80', false],
    ['http://192.168.1.1', false],
    ['192.168..1', false],
    ['127.0.0.1', false],
  ])('%s -> %s', (ip, expected) => {
    expect(isPrivateIpv4(ip)).toBe(expected);
  });
});

describe('localScanTargets', () => {
  it('only ever suggests private CIDRs small enough to enumerate', () => {
    for (const cidr of localScanTargets()) {
      expect(() => expandCidr(cidr)).not.toThrow();
    }
  });
});
