/** Supported device locales: de/en, optionally followed by an ISO region.
 * Accept legacy underscores, but validate the complete value before resolving.
 */
export function normalizeDeviceLanguage(locale: string | null | undefined): 'en' | 'de' {
  return /^de(?:[-_](?:[a-z]{2}|[0-9]{3}))?$/i.test(locale?.trim() ?? '') ? 'de' : 'en';
}
