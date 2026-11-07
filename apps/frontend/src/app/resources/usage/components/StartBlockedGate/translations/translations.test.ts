import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';

describe('StartBlockedGate translations', () => {
  it.each([
    ['en', en],
    ['de', de],
  ])('%s fills its placeholders with the double braces the translation helper compiles', (_lang, texts) => {
    for (const text of Object.values(texts)) {
      expect(text).not.toMatch(/(?<!\{)\{\w+\}(?!\})/);
    }
    expect(texts.until).toContain('{{time}}');
  });
});
