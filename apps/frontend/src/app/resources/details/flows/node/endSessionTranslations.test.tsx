import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';

describe.each([
  ['en', en],
  ['de', de],
])('end-session node translations (%s)', (_locale, translations) => {
  it('shows the user id template literally in the help text', () => {
    // Translations are Handlebars templates, so the example must be escaped to survive rendering.
    const { result } = renderHook(() => useTranslations({ en: translations, de: translations }));
    const helpText = result.current.t('nodes.output.resource.usage.end-session.config.userId.helpText');
    expect(helpText).toContain('{{user.id}}');
    expect(helpText).not.toContain('\\');
  });

  it('names the dropdown options exactly in the target help text', () => {
    const target = translations.nodes.output.resource.usage['end-session'].config.target;
    for (const label of Object.values(target.enum)) {
      expect(target.helpText).toContain(label);
    }
  });
});
