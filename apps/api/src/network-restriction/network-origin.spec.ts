import { NetworkIpSource } from '@attraccess/application-models';
import { attachNetworkOrigin, resolveNetworkOrigin } from './network-origin';
import type { NetworkRestrictionConfig } from './network-restriction.config';

const config = (over: Partial<NetworkRestrictionConfig> = {}): NetworkRestrictionConfig => ({
  enabled: true,
  allowedRanges: ['10.0.0.0/8'],
  ipSource: NetworkIpSource.Client,
  headerName: 'X-Real-Ip',
  ...over,
});

describe('resolveNetworkOrigin', () => {
  it('uses the client IP Express resolved in client mode and ignores the header', () => {
    const request = { ip: '10.1.1.1', headers: { 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '8.8.8.8' } };
    expect(resolveNetworkOrigin(request, config())).toBe('10.1.1.1');
  });

  it('turns an IPv4-mapped client IP into IPv4 and drops an IPv6 zone', () => {
    expect(resolveNetworkOrigin({ ip: '::ffff:10.0.0.9', headers: {} }, config())).toBe('10.0.0.9');
    expect(resolveNetworkOrigin({ ip: 'fe80::1%eth0', headers: {} }, config())).toBe('fe80::1');
  });

  it('has no origin without an address', () => {
    expect(resolveNetworkOrigin({ headers: {} }, config())).toBeNull();
  });

  describe('header mode', () => {
    const header = config({ ipSource: NetworkIpSource.Header });

    it('reads the default X-Real-Ip header, whatever the request IP is', () => {
      expect(resolveNetworkOrigin({ ip: '10.9.9.9', headers: { 'x-real-ip': '203.0.113.5' } }, header)).toBe(
        '203.0.113.5',
      );
    });

    it('uses a configured header name, case-insensitively', () => {
      const custom = config({ ipSource: NetworkIpSource.Header, headerName: 'CF-Connecting-IP' });
      expect(resolveNetworkOrigin({ headers: { 'cf-connecting-ip': '192.0.2.1' } }, custom)).toBe('192.0.2.1');
    });

    it('takes the last entry of a list, the one the nearest proxy wrote', () => {
      const request = { headers: { 'x-real-ip': '10.0.0.1, 203.0.113.5 ,198.51.100.2' } };
      expect(resolveNetworkOrigin(request, header)).toBe('198.51.100.2');
      expect(resolveNetworkOrigin({ headers: { 'x-real-ip': ['10.0.0.1', '8.8.4.4'] } }, header)).toBe('8.8.4.4');
    });

    it.each([undefined, '', '   ', ',', 'localhost', '10.0.0.1:8080', 'unknown'])('fails closed for %p', (value) => {
      expect(resolveNetworkOrigin({ ip: '10.0.0.1', headers: { 'x-real-ip': value } }, header)).toBeNull();
    });

    it('matches an IPv6 header value', () => {
      expect(resolveNetworkOrigin({ headers: { 'x-real-ip': '::ffff:10.0.0.4' } }, header)).toBe('10.0.0.4');
    });
  });

  it('prefers an origin attached by the MCP gateway over everything on the inner request', () => {
    const inner = { ip: '127.0.0.1', headers: { 'x-real-ip': '10.0.0.1' } };
    attachNetworkOrigin(inner, '203.0.113.5');
    expect(resolveNetworkOrigin(inner, config({ ipSource: NetworkIpSource.Header }))).toBe('203.0.113.5');
    const unknown = { ip: '127.0.0.1', headers: {} };
    attachNetworkOrigin(unknown, null);
    expect(resolveNetworkOrigin(unknown, config())).toBeNull();
  });
});
