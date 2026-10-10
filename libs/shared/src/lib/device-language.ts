/** Resolve a complete locale to a supported device language, accepting legacy underscores. */
export function normalizeDeviceLanguage(locale: string | null | undefined): 'en' | 'de' {
  try {
    // Share the firmware's ASCII whitespace policy; reject Unicode padding.
    const tag = (locale ?? '').replace(/^[ \t\r\n\v\f]+|[ \t\r\n\v\f]+$/g, '').replace(/_/g, '-');
    // Intl.Locale can discard a repeated u-key and its malformed trailing fields
    // before validating them. Check the original extension, excluding private use.
    // https://www.unicode.org/reports/tr35/#Unicode_locale_identifier
    const unicodeExtension = tag.split(/-x(?:-|$)/i)[0].match(/-u(?=-|$)((?:-[a-z0-9]{2,8})*)/i)?.[1];
    if (unicodeExtension && !/^(?:-[a-z0-9]{3,8})*(?:-[a-z0-9][a-z](?:-[a-z0-9]{3,8})*)*$/i.test(unicodeExtension)) {
      return 'en';
    }
    return new Intl.Locale(tag).language === 'de' ? 'de' : 'en';
  } catch {
    return 'en';
  }
}
