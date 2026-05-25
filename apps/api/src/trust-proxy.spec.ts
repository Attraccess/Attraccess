// Unit tests for TRUST_PROXY env parsing and validation helpers
// FEATURE: Auth rate limiting — real client IP behind reverse proxy
import { isValidTrustProxyValue, resolveTrustProxySetting } from './trust-proxy';

describe('resolveTrustProxySetting', () => {
  it('treats empty / nullish as off (false)', () => {
    expect(resolveTrustProxySetting('')).toBe(false);
    expect(resolveTrustProxySetting('   ')).toBe(false);
    expect(resolveTrustProxySetting(null)).toBe(false);
    expect(resolveTrustProxySetting(undefined)).toBe(false);
  });

  it('treats explicit off keywords as false', () => {
    expect(resolveTrustProxySetting('false')).toBe(false);
    expect(resolveTrustProxySetting('off')).toBe(false);
    expect(resolveTrustProxySetting('none')).toBe(false);
    expect(resolveTrustProxySetting('no')).toBe(false);
    expect(resolveTrustProxySetting('OFF')).toBe(false);
    expect(resolveTrustProxySetting('False')).toBe(false);
  });

  it('maps "true" to boolean true', () => {
    expect(resolveTrustProxySetting('true')).toBe(true);
    expect(resolveTrustProxySetting('TRUE')).toBe(true);
  });

  it('maps integer strings to hop counts', () => {
    expect(resolveTrustProxySetting('0')).toBe(0);
    expect(resolveTrustProxySetting('1')).toBe(1);
    expect(resolveTrustProxySetting('2')).toBe(2);
    expect(resolveTrustProxySetting('10')).toBe(10);
    expect(resolveTrustProxySetting('  3  ')).toBe(3);
  });

  it('passes IP / CIDR / preset lists through as strings', () => {
    expect(resolveTrustProxySetting('127.0.0.1')).toBe('127.0.0.1');
    expect(resolveTrustProxySetting('10.0.0.0/8')).toBe('10.0.0.0/8');
    expect(resolveTrustProxySetting('loopback')).toBe('loopback');
    expect(resolveTrustProxySetting(' uniquelocal, 10.0.0.0/8 ')).toBe('uniquelocal, 10.0.0.0/8');
  });
});

describe('isValidTrustProxyValue', () => {
  it('accepts empty (reset to default)', () => {
    expect(isValidTrustProxyValue('')).toBe(true);
    expect(isValidTrustProxyValue('   ')).toBe(true);
    expect(isValidTrustProxyValue(null)).toBe(true);
    expect(isValidTrustProxyValue(undefined)).toBe(true);
  });

  it('accepts boolean and off keywords', () => {
    for (const value of ['true', 'false', 'off', 'none', 'no', 'OFF']) {
      expect(isValidTrustProxyValue(value)).toBe(true);
    }
  });

  it('accepts non-negative integer hop counts', () => {
    for (const value of ['0', '1', '2', '99']) {
      expect(isValidTrustProxyValue(value)).toBe(true);
    }
  });

  it('accepts valid IPv4 / IPv6 addresses and CIDR ranges', () => {
    for (const value of ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '2001:db8::/32']) {
      expect(isValidTrustProxyValue(value)).toBe(true);
    }
  });

  it('accepts named presets', () => {
    for (const value of ['loopback', 'linklocal', 'uniquelocal', 'LOOPBACK']) {
      expect(isValidTrustProxyValue(value)).toBe(true);
    }
  });

  it('accepts comma-separated mixed lists', () => {
    expect(isValidTrustProxyValue('loopback, 10.0.0.0/8, 192.168.0.1')).toBe(true);
    expect(isValidTrustProxyValue('uniquelocal,127.0.0.1')).toBe(true);
  });

  it('rejects malformed values', () => {
    for (const value of [
      'abc',
      '999.999.0.0',
      '10.0.0.0/99',
      '2001:db8::/200',
      '10.0.0.0/8/9',
      '10.0.0.0/',
      '-1',
      '1.5',
      'loopback,,10.0.0.0/8',
      '10.0.0.0/abc',
    ]) {
      expect(isValidTrustProxyValue(value)).toBe(false);
    }
  });
});
