export function makeStringLVGLReady(input: string): string {
  if (!input) return input;

  // Step 1: Explicit replacements for unsupported punctuation and symbols
  const explicitReplacements: Array<[RegExp, string]> = [
    // Common symbols and punctuation
    [/\u2018|\u2019|\u201A|\u2032/g, "'"], // smart single quotes, prime
    [/\u201C|\u201D|\u201E|\u2033/g, '"'], // smart double quotes, double prime
    [/\u2013|\u2014|\u2015/g, '-'], // en/em/horizontal bar -> hyphen
    [/\u2026/g, '...'], // ellipsis
    [/\u2022/g, '-'], // bullet -> hyphen
    [/\u2122/g, 'TM'], // trademark
  ];

  let output = input;
  for (const [pattern, replacement] of explicitReplacements) {
    output = output.replace(pattern, replacement);
  }

  // The reader's Latin-1 fonts cover printable ASCII plus U+00A0-U+00FF.
  // Normalize only unsupported code points so existing Latin-1 glyphs survive.
  return Array.from(output)
    .map((character) => {
      if (/^[\n\r\t\x20-\x7E\xA0-\xFF]$/.test(character)) {
        return character;
      }

      const fallback = character.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return /^[\x20-\x7E]*$/.test(fallback) ? fallback : '?';
    })
    .join('');
}
