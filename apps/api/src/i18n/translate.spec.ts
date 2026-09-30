import { createTranslator } from './translate';

describe('createTranslator', () => {
  const t = createTranslator({
    en: { greeting: 'Hello {name}', onlyEnglish: 'English only' },
    de: { greeting: 'Hallo {name}' },
  });

  it('resolves the locale-specific string with variables', () => {
    expect(t('de', 'greeting', { name: 'Anna' })).toBe('Hallo Anna');
  });

  it('normalizes region subtags', () => {
    expect(t('de-AT', 'greeting', { name: 'Anna' })).toBe('Hallo Anna');
  });

  it('falls back to English for keys missing in the user locale', () => {
    expect(t('de', 'onlyEnglish')).toBe('English only');
  });

  it('falls back to English for unknown or missing locales', () => {
    expect(t('fr', 'greeting', { name: 'Anna' })).toBe('Hello Anna');
    expect(t(null, 'greeting', { name: 'Anna' })).toBe('Hello Anna');
    expect(t(undefined, 'greeting', { name: 'Anna' })).toBe('Hello Anna');
  });

  it('returns the key when no translation exists at all', () => {
    expect(t('en', 'missing.key')).toBe('missing.key');
  });

  it('leaves placeholders without a provided variable untouched', () => {
    expect(t('en', 'greeting')).toBe('Hello {name}');
  });
});
