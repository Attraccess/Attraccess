import { normalizeDeviceLanguage } from './device-language';

describe('device language locale normalization', () => {
  it.each([
    'de',
    'de-DE',
    ' DE_at ',
    'de-123',
    'de-Latn-DE',
    'de-DE-u-co-phonebk',
    'de-CH-1901',
    'de-Latn-CH-1996-u-ca-gregory',
    'de-DE-x-reader',
    'de-a-foo-b-bar',
    'de-DE-extra',
    'de-1234',
  ])('resolves the complete German locale %s', (locale) => {
    expect(normalizeDeviceLanguage(locale)).toBe('de');
  });

  it.each([
    null,
    undefined,
    '',
    'en-Latn-US',
    'fr-DE',
    'x-de',
    'de-',
    'de-!!!',
    'de--DE',
    'de-Latn-DE-!',
    'de-DE-Latn',
    'de-abc',
    'de-u',
    'de-u-x-private',
    'de-x',
    'de-1901-1901',
    'de-u-co-phonebk-u-ca-gregory',
    'de-DE-extraextra',
  ])('uses English for unsupported or malformed locale %s', (locale) => {
    expect(normalizeDeviceLanguage(locale)).toBe('en');
  });
});
