/** Resolve a complete locale to a supported device language, accepting legacy underscores. */
export function normalizeDeviceLanguage(locale: string | null | undefined): 'en' | 'de' {
  try {
    return new Intl.Locale((locale ?? '').trim().replace(/_/g, '-')).language === 'de' ? 'de' : 'en';
  } catch {
    return 'en';
  }
}
