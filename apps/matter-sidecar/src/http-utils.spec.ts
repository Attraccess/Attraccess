import { loadConfig } from './config';
import { TEST_TOKEN } from './testing/config';
import { checkLocalAccess, hostnameOf } from './http-utils';

const allowedHosts = loadConfig({
  MATTER_SIDECAR_AUTH_TOKEN: TEST_TOKEN,
  MATTER_SIDECAR_BIND_HOST: '0.0.0.0',
  MATTER_SIDECAR_ALLOW_INSECURE_REMOTE: 'true',
  MATTER_SIDECAR_ALLOWED_HOSTS: 'fd00::5, [FD00::6], Matter.LAN',
}).allowedHosts;
const access = (host: string | undefined, extra: Record<string, string> = {}) =>
  checkLocalAccess({ ...(host === undefined ? {} : { host }), ...extra }, allowedHosts);

describe('hostnameOf', () => {
  it.each([
    ['matter.lan', 'matter.lan'],
    ['Matter.LAN:8581', 'matter.lan'],
    ['matter.lan.:8581', 'matter.lan'],
    ['[FD00::5]:8581', '[fd00::5]'],
    ['[fd00::5]', '[fd00::5]'],
    ['192.168.1.5:8581', '192.168.1.5'],
    // Not a valid Host: kept whole so it matches no entry instead of being cut down to `fd`.
    ['fd00::5', 'fd00::5'],
  ])('reads %p as %p', (host, expected) => {
    expect(hostnameOf(host)).toBe(expected);
  });

  it('is null without a Host', () => {
    expect(hostnameOf(undefined)).toBeNull();
    expect(hostnameOf('')).toBeNull();
  });
});

describe('checkLocalAccess', () => {
  it.each([
    ['a bare IPv6 entry with a port', '[fd00::5]:8581'],
    ['a bare IPv6 entry without a port', '[fd00::5]'],
    ['a bracketed IPv6 entry', '[fd00::6]:8581'],
    ['a name with a port', 'matter.lan:8581'],
    ['an uppercase Host', 'MATTER.LAN'],
    ['an uppercase Host with a port', 'Matter.Lan:8581'],
    ['loopback', 'localhost:8581'],
    ['IPv6 loopback', '[::1]:8581'],
  ])('accepts %s', (_name, host) => {
    expect(access(host)).toBeNull();
  });

  it.each([
    ['the start of an IPv6 entry', 'fd'],
    ['the start of an IPv6 entry with a port', 'fd:8581'],
    ['an unbracketed IPv6 Host', 'fd00::5'],
    ['an unlisted name', 'evil.example'],
    ['an unlisted address', '[fd00::7]:8581'],
  ])('refuses %s', (_name, host) => {
    expect(access(host)).toContain('MATTER_SIDECAR_ALLOWED_HOSTS');
  });

  it('refuses a missing Host and any browser Origin', () => {
    expect(access(undefined)).toContain('needs a Host header');
    expect(access('localhost', { origin: 'http://localhost' })).toContain('Browser-origin');
  });
});
