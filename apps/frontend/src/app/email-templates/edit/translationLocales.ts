export type LocaleValues = Record<string, string>;

// Curated dropdown list; anything else (rarer languages, regional overrides
// like fr-CA) can be added via the validated "Other language…" input below.
export const COMMON_LOCALES = [
  'en',
  'en-GB',
  'en-US',
  'de',
  'de-AT',
  'de-CH',
  'fr',
  'fr-CA',
  'es',
  'it',
  'nl',
  'pt',
  'pt-BR',
  'pl',
  'cs',
  'sk',
  'da',
  'sv',
  'nb',
  'fi',
  'ru',
  'uk',
  'tr',
  'ar',
  'he',
  'ja',
  'ko',
  'zh',
  'zh-TW',
  'hi',
  'el',
  'hu',
  'ro',
  'bg',
  'hr',
  'sl',
  'sr',
  'lt',
  'lv',
  'et',
  'ca',
  'eu',
  'ga',
  'id',
  'th',
  'vi',
];

// Mirrors the backend DTO validation for translation locales.
export const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Z]{2,3})?$/;

export const normalize = (values: LocaleValues | undefined) =>
  JSON.stringify(
    Object.entries(values ?? {})
      .filter(([, v]) => v.trim() !== '')
      .sort(([a], [b]) => a.localeCompare(b)),
  );
