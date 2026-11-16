import { describe, expect, it } from 'vitest';
import { describeInstallFailure } from './describeInstallFailure';

const t = (key: string) => `[${key}]`;

describe('describeInstallFailure', () => {
  it('combines the server reason with the compatibility remedy', () => {
    expect(
      describeInstallFailure({ status: 400, body: { message: 'Plugin is not compatible with Attraccess 1.9.0' } }, t),
    ).toBe('Plugin is not compatible with Attraccess 1.9.0 [marketplace.installCompatibilityHelp]');
  });

  it('joins validation message lists', () => {
    expect(describeInstallFailure({ status: 400, body: { message: ['a', 'b'] } }, t)).toBe(
      'a; b [marketplace.installRetryHelp]',
    );
  });

  it.each([
    [401, 'marketplace.installPermissionHelp'],
    [403, 'marketplace.installPermissionHelp'],
    [404, 'marketplace.installVersionHelp'],
    [500, 'marketplace.installServerHelp'],
    [418, 'marketplace.installRetryHelp'],
  ])('maps status %s to its remedy without a reason', (status, key) => {
    expect(describeInstallFailure({ status }, t)).toBe(`[${key}]`);
  });

  it('points at the missing route when the server does not know the endpoint', () => {
    expect(describeInstallFailure({ status: 404, body: { message: 'Cannot POST /api/plugins/npm/x' } }, t)).toBe(
      'Cannot POST /api/plugins/npm/x [marketplace.installRouteHelp]',
    );
  });

  it('falls back to the retry remedy for non-object errors', () => {
    expect(describeInstallFailure(new Error('boom'), t)).toBe('[marketplace.installRetryHelp]');
  });
});
