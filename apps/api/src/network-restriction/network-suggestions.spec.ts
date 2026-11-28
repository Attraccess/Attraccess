import { serverInterfaceRanges, subnetOf } from './network-suggestions';

describe('subnetOf', () => {
  it('clears the host bits of an IPv4 address', () => {
    expect(subnetOf('192.168.7.42')).toBe('192.168.7.0/24');
    expect(subnetOf('::ffff:10.1.2.3')).toBe('10.1.2.0/24');
    expect(subnetOf('203.0.113.200', 20)).toBe('203.0.112.0/20');
  });

  it('clears the host bits of an IPv6 address', () => {
    expect(subnetOf('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(subnetOf('fd00::1')).toBe('fd00::/64');
    expect(subnetOf('::1', 128, 128)).toBe('::1/128');
  });

  it('is null for something that is not an address', () => {
    expect(subnetOf('nope')).toBeNull();
  });
});

describe('serverInterfaceRanges', () => {
  it('lists external subnets once and skips loopback and link-local', () => {
    const entry = (address: string, family: 'IPv4' | 'IPv6', cidr: string, internal = false) =>
      ({ address, family, cidr, internal, netmask: '', mac: '' }) as never;
    const ranges = serverInterfaceRanges({
      lo: [entry('127.0.0.1', 'IPv4', '127.0.0.1/8', true)],
      eth0: [
        entry('192.168.1.5', 'IPv4', '192.168.1.5/24'),
        entry('192.168.1.6', 'IPv4', '192.168.1.6/24'),
        entry('fe80::1', 'IPv6', 'fe80::1/64'),
        entry('169.254.3.4', 'IPv4', '169.254.3.4/16'),
        entry('fd12:3456::9', 'IPv6', 'fd12:3456::9/64'),
      ],
    });
    expect(ranges).toEqual(['192.168.1.0/24', 'fd12:3456::/64']);
  });

  it('suggests nothing when the interfaces cannot be listed', () => {
    expect(serverInterfaceRanges(null)).toEqual([]);
  });
});
