import * as Handlebars from 'handlebars';

type TranslationRecord = Record<string, unknown>;

interface TranslationModules<T extends TranslationRecord = TranslationRecord> {
  en: T;
  [locale: string]: T;
}

type NestedValue = string | TranslationRecord;

function getNestedValue(obj: TranslationRecord, key: string): string | undefined {
  const parts = key.split('.');
  let current: NestedValue = obj;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as TranslationRecord)[part] as NestedValue;
  }

  return typeof current === 'string' ? current : undefined;
}

export function createTranslator<T extends TranslationRecord>(translations: TranslationModules<T>) {
  return function t(locale: string, key: string, vars?: Record<string, unknown>): string {
    const lang = locale in translations ? locale : 'en';
    const translation =
      getNestedValue(translations[lang] as TranslationRecord, key) ??
      getNestedValue(translations['en'] as TranslationRecord, key);

    if (translation === undefined) {
      return `!!!${key}!!!`;
    }

    return vars ? Handlebars.compile(translation)(vars) : translation;
  };
}
