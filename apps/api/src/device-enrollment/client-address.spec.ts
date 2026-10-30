import { IncomingMessage } from 'http';
import { resolveClientAddress } from './client-address';

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

  it('does not let a spoofed header past an untrusted peer', () => {
    expect(resolveClientAddress(request('8.8.8.8', '6.6.6.6'), 'loopback')).toBe('8.8.8.8');
  });
});
