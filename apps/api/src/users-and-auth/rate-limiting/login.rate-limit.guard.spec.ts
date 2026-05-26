import { resolveIp } from './login.rate-limit.guard';
import { Request } from 'express';

describe('resolveIp', () => {
  const createRequest = (overrides?: Partial<Request>): Request =>
    ({
      ip: '203.0.113.42',
      headers: {} as Request['headers'],
      socket: { remoteAddress: '198.51.100.7' } as Request['socket'],
      ...overrides,
    } as Request);

  it('returns request.ip, which Express derives via the "trust proxy" setting', () => {
    expect(resolveIp(createRequest({ ip: '203.0.113.42' }))).toBe('203.0.113.42');
  });

  it('does NOT trust client-supplied forwarding headers itself (defers entirely to Express)', () => {
    const req = createRequest({
      ip: '172.20.0.6',
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'x-real-ip': '5.6.7.8',
        'cf-connecting-ip': '9.10.11.12',
      } as Request['headers'],
    });
    expect(resolveIp(req)).toBe('172.20.0.6');
  });

  it('falls back to socket.remoteAddress when request.ip is missing', () => {
    const req = createRequest({ ip: undefined, socket: { remoteAddress: '198.51.100.7' } as Request['socket'] });
    expect(resolveIp(req)).toBe('198.51.100.7');
  });

  it('returns "unknown" when neither request.ip nor socket address is available', () => {
    const req = createRequest({ ip: undefined, socket: { remoteAddress: undefined } as Request['socket'] });
    expect(resolveIp(req)).toBe('unknown');
  });

  it('collapses IPv4-mapped IPv6 addresses to their IPv4 form so each client gets one bucket', () => {
    expect(resolveIp(createRequest({ ip: '::ffff:127.0.0.1' }))).toBe('127.0.0.1');
    expect(resolveIp(createRequest({ ip: '::ffff:203.0.113.42' }))).toBe('203.0.113.42');
  });
});
