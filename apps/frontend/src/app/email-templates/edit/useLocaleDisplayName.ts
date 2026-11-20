import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useMemo } from 'react';
import de from './de.json';
import en from './en.json';

/** Resolves a locale code to its language name in the UI language; falls back to the code itself. */
export function useLocaleDisplayName() {
  const { language } = useTranslations({ en, de });
  const languageNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([language], { type: 'language' });
    } catch {
      return null;
    }
  }, [language]);

  return useCallback(
    (locale: string) => {
      if (!locale) return '';
      try {
        return languageNames?.of(locale) ?? locale;
      } catch {
        return locale;
      }
    },
    [languageNames],
  );
}
