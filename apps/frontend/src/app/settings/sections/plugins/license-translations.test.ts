import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';

// The app's translation helper resolves plurals from a `{ one, many }` object chosen by `count`. A flat
// `key_one` / `key_other` pair (i18next style) is not resolved and renders as a raw key.
describe('license_missing translations', () => {
  it.each([
    ['en', en],
    ['de', de],
  ])('has a one/many plural for the missing modules in %s', (_lang, translations) => {
    const plural = translations.status.licenseMissingModules as { one: string; many: string };
    expect(plural.one).toContain('{{modules}}');
    expect(plural.many).toContain('{{modules}}');
    expect(plural.one).not.toEqual(plural.many);
    expect(translations.status).not.toHaveProperty('licenseMissingModules_one');
  });
});
