import { describe, expect, it } from 'vitest';
import { describeInstallFailure } from './describeInstallFailure';

const t = (key: string) => `[${key}]`;

describe('describeInstallFailure', () => {
  it('combines the server reason with the compatibility remedy', () => {
    expect(
      describeInstallFailure({ status: 400, body: { message: 'Plugin is not compatible with Attraccess 1.9.0' } }, t),
    ).toBe('Plugin is not compatible with Attraccess 1.9.0 [marketplace.installCompatibilityHelp]');
  });

  it('maps an SDK 1.x refusal to the compatibility remedy instead of a registry retry', () => {
    const reason =
      'Plugin legacy targets Attraccess 1.9.0 and the plugin SDK 1.x, which this host no longer supports. ' +
      'Rebuild it for SDK 2.0 and declare attraccessVersion.min >= 2.0.0-0. ' +
      'Migration guide: https://docs.attraccess.org/#/en/plugins/migrating-to-2';
    expect(describeInstallFailure({ status: 400, body: { message: reason } }, t)).toBe(
      `${reason} [marketplace.installCompatibilityHelp]`,
    );
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
