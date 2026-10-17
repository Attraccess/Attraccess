export interface DateTimePreferences {
  /** null follows the translation language. */
  dateTimeLocale: string | null;
}

export const DATE_TIME_LOCALE_MAX_LENGTH = 255;
export type DateTimeLocaleValidation =
  { locale: string; error?: never } | { error: 'invalid' | 'unsupported'; locale?: never };

export function validateDateTimeLocale(value: unknown): DateTimeLocaleValidation {
  if (typeof value !== 'string' || !value.trim() || value.length > DATE_TIME_LOCALE_MAX_LENGTH) {
    return { error: 'invalid' };
  }
  try {
    const [locale] = Intl.getCanonicalLocales(value.trim());
    if (!locale) return { error: 'invalid' };
    if (!Intl.DateTimeFormat.supportedLocalesOf([locale]).length) return { error: 'unsupported' };
    return { locale };
  } catch {
    return { error: 'invalid' };
  }
}

export function resolveDateTimePreferences(dateTimeLocale?: string | null): DateTimePreferences {
  return { dateTimeLocale: validateDateTimeLocale(dateTimeLocale).locale ?? null };
}
