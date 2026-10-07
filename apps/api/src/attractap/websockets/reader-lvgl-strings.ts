import { ReaderMessageProtocolImplementation } from './reader-message-protocol';
export abstract class ReaderLvglStringsImplementation extends ReaderMessageProtocolImplementation {
  protected makeStringLVGLReady(input: string): string {
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

  protected sanitizeForLVGL<T>(value: T): T {
    const seen = new WeakSet<object>();

    const sanitize = (v: unknown): unknown => {
      if (typeof v === 'string') return this.makeStringLVGLReady(v);
      if (v === null || v === undefined) return v;
      if (Array.isArray(v)) return v.map((item) => sanitize(item));
      if (typeof v === 'object') {
        const obj = v as Record<string, unknown>;
        if (seen.has(obj)) return obj;
        seen.add(obj);
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(obj)) {
          // Select options and draft values are protocol values: changing them
          // prevents the firmware from submitting the value the API validates.
          // Object-based options contain display metadata such as placeholders.
          out[k] = (k === 'options' && Array.isArray(val)) || k === 'value' || k === 'answers' ? val : sanitize(val);
        }
        return out;
      }
      return v;
    };

    return sanitize(value) as T;
  }
}
