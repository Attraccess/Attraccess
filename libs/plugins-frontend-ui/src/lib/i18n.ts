import { useTranslationDiagnostics } from './i18n-diagnostics';
import { isPluralObject, resolvePlural } from './i18n-plurals';
import { useCallback, useState } from 'react';
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

export type Language = keyof TranslationModules;

interface TranslationState {
  language: Language;
  setLanguage: (language: Language) => void;
}
export const useTranslationState = create<TranslationState>((set) => ({
  language: 'en',
  setLanguage: (language) => {
    const supportedLanguage = language === 'de' ? 'de' : 'en';
    set({ language: supportedLanguage });
    try {
      globalThis.localStorage?.setItem(I18N_LANGUAGE_STORAGE_KEY, supportedLanguage);
    } catch {
      // Language switching must still work when browser storage is unavailable.
    }
  },
}));

export type TFunction = (key: string, data?: Record<string, unknown>) => string;
/** Retained translations stay reactive; literal API errors remain intact. */
export interface TranslationMessage {
  key: string;
  data?: Record<string, unknown>;
}
interface TranslationOptions {
  /** Disable only for React text rendering, never for messages rendered as HTML. */
  escapeValues?: boolean;
}
interface TExistsOptions {
  succeedIfKeyIsObject?: boolean;
}
export type TExists = (key: string, options?: TExistsOptions) => boolean;

interface UseTranslationsResponse {
  t: TFunction;
  tMessage: (message: TranslationMessage | string) => string;
  tExists: TExists;
  language: Language;
  setLanguage: (language: Language) => void;
}

export function useTranslations(
  translations: TranslationModules,
  options: TranslationOptions = {},
): UseTranslationsResponse {
  const { language, setLanguage } = useTranslationState();

  // Keep a stable reference to the provided translations so callers
  // can safely pass inline objects without causing re-renders.
  const [initialTranslations] = useState(translations);

  const activeTranslations = initialTranslations[language];
  const fallbackTranslations = initialTranslations.en;

  const getTranslationRaw = useCallback(
    (key: string) => {
      const fallbackTranslation = get(fallbackTranslations, key);
      const translation = get(activeTranslations, key, fallbackTranslation);
      return translation;
    },
    [activeTranslations, fallbackTranslations],
  );

  const t = useCallback(
    (key: string, data?: Record<string, unknown>) => {
      const ABSOLUTE_FALLBACK_TRANSLATION = `!!! ${key} !!!`;
      let translation = getTranslationRaw(key);

      // Handle pluralization
      if (isPluralObject(translation) && data && typeof data.count === 'number') {
        translation = resolvePlural(translation, data.count);
      }

      if (translation === undefined || typeof translation !== 'string') {
        console.error(`Missing translation for key: ${key}`);
        return ABSOLUTE_FALLBACK_TRANSLATION;
      }

      const template = Handlebars.compile(translation, { noEscape: options.escapeValues === false });
      return template(data);
    },
    [getTranslationRaw, options.escapeValues],
  );

  const tMessage = useCallback(
    (message: TranslationMessage | string) => (typeof message === 'string' ? message : t(message.key, message.data)),
    [t],
  );

  const tExists = useCallback(
    (key: string, options?: TExistsOptions) => {
      const translation = getTranslationRaw(key);
      return (
        translation !== undefined &&
        (typeof translation === 'string' ||
          isPluralObject(translation) ||
          (options?.succeedIfKeyIsObject && typeof translation === 'object'))
      );
    },
    [getTranslationRaw],
  ) as TExists;

  useTranslationDiagnostics(initialTranslations);

  return {
    t,
    tMessage,
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
  useTranslationState.getState().setLanguage(language === 'de' ? 'de' : 'en');
}
