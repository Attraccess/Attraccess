import { useCallback, useMemo } from 'react';
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

  const activeTranslations = useMemo(() => {
    return translations[language];
  }, [language, translations]);

  const fallbackTranslations = useMemo(() => {
    return translations['en'];
  }, [translations]);

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
