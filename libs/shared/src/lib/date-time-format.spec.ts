import { DATE_TIME_LOCALE_MAX_LENGTH, resolveDateTimePreferences, validateDateTimeLocale } from './date-time-format';

describe('validateDateTimeLocale', () => {
  it.each([
    ['en-US', 'en-US'],
    ['de-de', 'de-DE'],
    ['  fr  ', 'fr'],
  ])('canonicalizes the supported locale %p to %p', (value, locale) => {
    expect(validateDateTimeLocale(value)).toEqual({ locale });
  });

  it.each([
    ['a non-string value', 42],
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['a whitespace-only string', '   '],
    ['an overly long string', 'a'.repeat(DATE_TIME_LOCALE_MAX_LENGTH + 1)],
    ['a malformed language tag', 'x-private'],
    ['a syntactically invalid tag', 'not a locale'],
  ])('rejects %s as invalid', (_label, value) => {
    expect(validateDateTimeLocale(value)).toEqual({ error: 'invalid' });
  });

  it('reports well-formed locales the runtime cannot format as unsupported', () => {
    expect(validateDateTimeLocale('qaa')).toEqual({ error: 'unsupported' });
  });
});

describe('resolveDateTimePreferences', () => {
  it('keeps a valid locale in canonical form', () => {
    expect(resolveDateTimePreferences('en-gb')).toEqual({ dateTimeLocale: 'en-GB' });
  });

  it.each([undefined, null, 'qaa', 'x-private'])('falls back to the translation language for %p', (value) => {
    expect(resolveDateTimePreferences(value)).toEqual({ dateTimeLocale: null });
  });
});
