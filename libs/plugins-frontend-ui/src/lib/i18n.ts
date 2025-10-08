import { useCallback, useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { get } from 'lodash-es';
import * as Handlebars from 'handlebars';

// Customize Handlebars escaping: keep quotes/apostrophes as-is, escape only &, <, >
// This ensures names like Jappy's render correctly while still preventing HTML injection.
Handlebars.Utils.escapeExpression = (input: unknown): string => {
  const str = String(input ?? '');
  // Order matters: escape & first to avoid double escaping
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

export const I18N_LANGUAGE_STORAGE_KEY = 'language';
type TranslationRecord = Record<string, unknown>;

interface TranslationModules<T extends TranslationRecord = TranslationRecord> {
  en: T;
  de: T;
}

type Language = keyof TranslationModules;

interface TranslationState {
  language: Language;
  setLanguage: (language: Language) => void;
}
export const useTranslationState = create<TranslationState>((set) => ({
  language: 'en',
  setLanguage: (language) => {
    set({ language });
    localStorage.setItem(I18N_LANGUAGE_STORAGE_KEY, language);
  },
}));

export type TFunction = (key: string, data?: Record<string, unknown>) => string;
export type TExists = (key: string) => boolean;

interface UseTranslationsResponse {
  t: TFunction;
  tExists: TExists;
  language: Language;
  setLanguage: (language: Language) => void;
}

export function useTranslations(translations: TranslationModules): UseTranslationsResponse {
  const { language, setLanguage } = useTranslationState();

  // Keep a stable reference to the provided translations so callers
  // can safely pass inline objects without causing re-renders.
  const translationsRef = useRef(translations);

  const activeTranslations = useMemo(() => {
    return translationsRef.current[language];
  }, [language]);

  const fallbackTranslations = useMemo(() => {
    return translationsRef.current['en'];
  }, []);

  const getTranslationRaw = useCallback(
    (key: string) => {
      const fallbackTranslation = get(fallbackTranslations, key);
      const translation = get(activeTranslations, key, fallbackTranslation);
      return translation;
    },
    [activeTranslations, fallbackTranslations],
  );

  const getTranslationTemplate = useCallback(
    (key: string) => {
      const translation = getTranslationRaw(key);
      if (translation === undefined) {
        return undefined;
      }
      return Handlebars.compile(translation);
    },
    [getTranslationRaw],
  );

  const t = useCallback(
    (key: string, data?: Record<string, unknown>) => {
      const ABSOLUTE_FALLBACK_TRANSLATION = `!!! ${key} !!!`;
      const translationTemplate = getTranslationTemplate(key);
      if (translationTemplate === undefined) {
        console.error(`Missing translation for key: ${key}`);
        return ABSOLUTE_FALLBACK_TRANSLATION;
      }
      return translationTemplate(data);
    },
    [getTranslationTemplate],
  );

  const tExists = useCallback(
    (key: string) => {
      const translation = getTranslationRaw(key);
      return translation !== undefined;
    },
    [getTranslationRaw],
  );

  const nestedObjectToDotNotatedKeys = (obj: Record<string, unknown>): string[] => {
    const keys: string[] = [];

    const walk = (current: Record<string, unknown>, prefix: string) => {
      Object.entries(current).forEach(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          // Recurse into nested objects; arrays are treated as leaves to avoid index-based keys
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
    Object.entries(translationsRef.current).forEach(([lang, translations]) => {
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

    const expectedLangs = Object.keys(translationsRef.current);

    // log keys that are not in all languages together with the languages that are missing them
    keyLangMap.forEach((keySet, key) => {
      if (keySet.size === expectedLangs.length) {
        return;
      }

      const missingLangs = expectedLangs.filter((lang) => !keySet.has(lang));
      console.error('Missing i18n Translation Key:', key, 'in languages:', missingLangs);
    });
  }, []);

  return {
    t,
    tExists,
    language,
    setLanguage,
  };
}

export function detectAndSetLanguage() {
  const localStorageLanguage = localStorage.getItem(I18N_LANGUAGE_STORAGE_KEY);
  const sessionStorageLanguage = sessionStorage.getItem(I18N_LANGUAGE_STORAGE_KEY);
  let navigatorLanguage = navigator.language;
  if (navigatorLanguage.includes('-')) {
    navigatorLanguage = navigatorLanguage.split('-')[0];
  }

  const language = localStorageLanguage || sessionStorageLanguage || navigatorLanguage;
  useTranslationState.getState().setLanguage(language as Language);
}
