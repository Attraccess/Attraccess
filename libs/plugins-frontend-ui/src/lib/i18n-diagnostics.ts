import { useEffect } from 'react';
import { isPluralObject } from './i18n-plurals';

export function useTranslationDiagnostics(initialTranslations: {
  en: Record<string, unknown>;
  de: Record<string, unknown>;
}) {
  const nestedObjectToDotNotatedKeys = (obj: Record<string, unknown>): string[] => {
    const keys: string[] = [];

    const walk = (current: Record<string, unknown>, prefix: string) => {
      Object.entries(current).forEach(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;

        if (value !== null && typeof value === 'object' && !Array.isArray(value) && !isPluralObject(value)) {
          // Recurse into nested objects; arrays and plural objects are treated as leaves
          walk(value as Record<string, unknown>, path);
        } else {
          keys.push(path);
        }
      });
    };

    walk(obj, '');
    return keys;
  };

  // log missing translation keys when in development mode
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const keyLangMap = new Map<string, Set<string>>();
    Object.entries(initialTranslations).forEach(([lang, translations]) => {
      const keys = nestedObjectToDotNotatedKeys(translations);
      keys.forEach((key) => {
        let keySet = keyLangMap.get(key);
        if (!keySet) {
          keySet = new Set();
          keyLangMap.set(key, keySet);
        }

        keySet.add(lang);
      });
    });

    const expectedLangs = Object.keys(initialTranslations);

    // log keys that are not in all languages together with the languages that are missing them
    keyLangMap.forEach((keySet, key) => {
      if (keySet.size === expectedLangs.length) {
        return;
      }

      const missingLangs = expectedLangs.filter((lang) => !keySet.has(lang));
      console.error('Missing i18n Translation Key:', key, 'in languages:', missingLangs);
    });
  }, [initialTranslations]);
}
