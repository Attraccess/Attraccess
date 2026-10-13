/** Recognize a complete supported locale without turning an unsupported language into English. */
export function getSupportedDeviceLanguage(locale: string | null | undefined): 'en' | 'de' | undefined {
  try {
    // Normalize legacy locale spellings at the server/browser boundary; reject Unicode padding.
    const input = locale ?? '';
    let start = 0;
    let end = input.length;
    // Scan each edge once, avoiding regex backtracking on untrusted input.
    while (start < end && ' \t\r\n\v\f'.includes(input[start])) start++;
    while (end > start && ' \t\r\n\v\f'.includes(input[end - 1])) end--;
    const tag = input.slice(start, end).replace(/_/g, '-');
    // Intl.Locale can discard a repeated u-key and its malformed trailing fields
    // before validating them. Check the original extension, excluding private use.
    // https://www.unicode.org/reports/tr35/#Unicode_locale_identifier
    const unicodeExtension = tag.split(/-x(?:-|$)/i)[0].match(/-u(?=-|$)((?:-[a-z0-9]{2,8})*)/i)?.[1];
    if (unicodeExtension && !/^(?:-[a-z0-9]{3,8})*(?:-[a-z0-9][a-z](?:-[a-z0-9]{3,8})*)*$/i.test(unicodeExtension)) {
      return undefined;
    }
    const language = new Intl.Locale(tag).language;
    return language === 'de' || language === 'en' ? language : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve a locale, using the supplied fallback only when no translation language matches. */
export function normalizeDeviceLanguage(locale: string | null | undefined, fallback: 'en' | 'de' = 'en'): 'en' | 'de' {
  return getSupportedDeviceLanguage(locale) ?? fallback;
}
