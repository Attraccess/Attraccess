import { IncomingMessage } from 'http';
import { addressBucket, resolveClientAddress } from './client-address';

function request(remote: string, forwarded?: string): IncomingMessage {
  return { socket: { remoteAddress: remote }, headers: forwarded ? { 'x-forwarded-for': forwarded } : {} } as never;
}

describe('resolveClientAddress', () => {
  it('ignores X-Forwarded-For without TRUST_PROXY', () => {
    expect(resolveClientAddress(request('10.0.0.2', '1.2.3.4'), undefined)).toBe('10.0.0.2');
  });

  it('unwraps IPv4-mapped addresses', () => {
    expect(resolveClientAddress(request('::ffff:192.168.1.5'), undefined)).toBe('192.168.1.5');
  });

  it('trusts a fixed number of hops', () => {
    expect(resolveClientAddress(request('10.0.0.2', '9.9.9.9, 1.2.3.4'), '1')).toBe('1.2.3.4');
    expect(resolveClientAddress(request('10.0.0.2', '9.9.9.9, 1.2.3.4'), '2')).toBe('9.9.9.9');
  });

  it('trusts presets and CIDR lists and stops at the first untrusted hop', () => {
    expect(resolveClientAddress(request('10.0.0.2', '1.2.3.4'), 'uniquelocal')).toBe('1.2.3.4');
    expect(resolveClientAddress(request('10.0.0.2', '7.7.7.7, 1.2.3.4'), '10.0.0.0/8')).toBe('1.2.3.4');
    expect(resolveClientAddress(request('8.8.8.8', '1.2.3.4'), 'uniquelocal')).toBe('8.8.8.8');
  });

  it('matches preset names case-sensitively, like Express', () => {
    expect(resolveClientAddress(request('127.0.0.1', '1.2.3.4'), 'loopback')).toBe('1.2.3.4');
    expect(resolveClientAddress(request('127.0.0.1', '1.2.3.4'), 'Loopback')).toBe('127.0.0.1');
  });

  it('does not let a spoofed header past an untrusted peer', () => {
    expect(resolveClientAddress(request('8.8.8.8', '6.6.6.6'), 'loopback')).toBe('8.8.8.8');
  });

  it.each(['10.0.0.0/33', 'fe80::/129', 'not-an-ip', '10.0.0.1/8/8', 'loopback,', '1.2.3.4/abc'])(
    'trusts no proxy for the invalid TRUST_PROXY value %s instead of throwing',
    (value) => {
      expect(() => resolveClientAddress(request('10.0.0.2', '1.2.3.4'), value)).not.toThrow();
      expect(resolveClientAddress(request('10.0.0.2', '1.2.3.4'), value)).toBe('10.0.0.2');
    },
  );

  it('picks up a changed TRUST_PROXY value', () => {
    expect(resolveClientAddress(request('10.0.0.2', '1.2.3.4'), '10.0.0.0/33')).toBe('10.0.0.2');
    expect(resolveClientAddress(request('10.0.0.2', '1.2.3.4'), '10.0.0.0/8')).toBe('1.2.3.4');
    expect(resolveClientAddress(request('10.0.0.2', '1.2.3.4'), undefined)).toBe('10.0.0.2');
  });

  it('falls back to the socket address when the request is unusual', () => {
    const odd = { socket: { remoteAddress: '10.0.0.2' }, headers: { 'x-forwarded-for': 42 } } as never;
    expect(resolveClientAddress(odd, 'true')).toBe('10.0.0.2');
  });
});

describe('addressBucket', () => {
  it('keeps IPv4, IPv4-mapped IPv6 and non-addresses as they are', () => {
    expect(addressBucket('192.168.1.5')).toBe('192.168.1.5');
    expect(addressBucket('::ffff:192.168.1.5')).toBe('192.168.1.5');
    expect(addressBucket('::FFFF:192.168.1.5')).toBe('192.168.1.5');
    expect(addressBucket('unknown')).toBe('unknown');
  });

  it('buckets IPv6 addresses by their /64 prefix', () => {
    const bucket = addressBucket('2001:db8:1:2::1');
    expect(bucket).toBe('2001:db8:1:2::/64');
    expect(addressBucket('2001:0db8:0001:0002:ffff:eeee:dddd:cccc')).toBe(bucket);
    expect(addressBucket('2001:DB8:1:2:abcd::')).toBe(bucket);
    expect(addressBucket('2001:db8:1:3::1')).not.toBe(bucket);
  });

  it('handles compression at either end, embedded IPv4 and zone ids', () => {
    expect(addressBucket('::')).toBe('0:0:0:0::/64');
    expect(addressBucket('::1')).toBe('0:0:0:0::/64');
    expect(addressBucket('2001:db8::')).toBe('2001:db8:0:0::/64');
    expect(addressBucket('64:ff9b::1.2.3.4')).toBe('64:ff9b:0:0::/64');
    expect(addressBucket('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(addressBucket('fe80::2%1')).toBe(addressBucket('fe80::1%eth0'));
  });
});
