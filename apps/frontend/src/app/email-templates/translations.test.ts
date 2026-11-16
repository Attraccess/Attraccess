import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';
import editDe from './edit/de.json';
import editEn from './edit/en.json';

describe('email template translations', () => {
  it.each([
    ['list en', en],
    ['list de', de],
    ['editor en', editEn],
    ['editor de', editDe],
  ])('%s: the plugin chip uses the double-brace placeholder the translation helper fills', (_name, texts) => {
    expect(texts.pluginChip).toContain('{{plugin}}');
  });
});
