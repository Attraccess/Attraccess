export interface DecodedPayload {
  kind: 'json' | 'text' | 'binary';
  text: string;
  // The shown text was cut to keep the log responsive.
  clipped: boolean;
}

const HEX_PREVIEW_BYTES = 256;
// Longest text a log row shows; the backend already caps payloads at 64 KiB.
export const MAX_DISPLAY_CHARS = 8 * 1024;
const JSON_INDENT = '  ';

// One decoder for every message; without `stream` each decode starts fresh.
const utf8 = new TextDecoder('utf-8', { fatal: true });

// An indexed loop: `Uint8Array.from(string, mapFn)` is far slower on large batches.
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Drops an incomplete multi-byte UTF-8 sequence at the end, which a byte-wise
// truncation can leave behind, so the rest still decodes as text.
function trimIncompleteUtf8(bytes: Uint8Array): Uint8Array {
  for (let back = 1; back <= Math.min(4, bytes.length); back++) {
    const byte = bytes[bytes.length - back];
    if ((byte & 0xc0) === 0x80) continue; // continuation byte: keep looking for the lead byte
    const expected = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return expected > back ? bytes.subarray(0, bytes.length - back) : bytes;
  }
  return bytes;
}

function clip(kind: DecodedPayload['kind'], text: string): DecodedPayload {
  return text.length > MAX_DISPLAY_CHARS
    ? { kind, text: `${text.slice(0, MAX_DISPLAY_CHARS)} …`, clipped: true }
    : { kind, text, clipped: false };
}

const isJsonWhitespace = (char: string) => char === ' ' || char === '\n' || char === '\r' || char === '\t';

/**
 * Re-indents valid JSON by changing only the whitespace outside strings, so the
 * shown values are exactly what was sent: no rounding of big integers, `1.10`
 * stays `1.10` and duplicate keys stay visible (a parse/stringify round trip
 * changes all three). Output matches `JSON.stringify(value, null, 2)` layout.
 */
export function reindentJson(json: string): string {
  let out = '';
  let depth = 0;
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    if (inString) {
      out += char;
      if (char === '\\') out += json[++i];
      else if (char === '"') inString = false;
      continue;
    }
    if (isJsonWhitespace(char)) continue;
    switch (char) {
      case '"':
        inString = true;
        out += char;
        break;
      case '{':
      case '[': {
        let next = i + 1;
        while (next < json.length && isJsonWhitespace(json[next])) next++;
        if (json[next] === (char === '{' ? '}' : ']')) {
          // An empty object or array stays on one line.
          out += char + json[next];
          i = next;
        } else {
          depth++;
          out += `${char}\n${JSON_INDENT.repeat(depth)}`;
        }
        break;
      }
      case '}':
      case ']':
        depth--;
        out += `\n${JSON_INDENT.repeat(depth)}${char}`;
        break;
      case ',':
        out += `,\n${JSON_INDENT.repeat(depth)}`;
        break;
      case ':':
        out += ': ';
        break;
      default:
        out += char;
    }
  }
  return out;
}

// Pretty JSON for an object or array; null for anything else.
function prettyJson(text: string): string | null {
  const start = text.trimStart()[0];
  if (start !== '{' && start !== '[') return null;
  try {
    JSON.parse(text); // only valid JSON is re-indented
  } catch {
    return null;
  }
  return reindentJson(text);
}

// Shows a payload as pretty JSON, UTF-8 text, or (when it is not text) hex. A
// truncated payload is never pretty-printed: its JSON is incomplete anyway.
export function decodePayload(base64: string, truncated = false): DecodedPayload {
  const all = base64ToBytes(base64);
  const bytes = truncated ? trimIncompleteUtf8(all) : all;
  try {
    const text = utf8.decode(bytes);
    // eslint-disable-next-line no-control-regex
    if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
      const pretty = truncated ? null : prettyJson(text);
      return pretty === null ? clip('text', text) : clip('json', pretty);
    }
  } catch {
    // not UTF-8
  }
  const shown = Array.from(all.subarray(0, HEX_PREVIEW_BYTES), (byte) => byte.toString(16).padStart(2, '0'));
  return { kind: 'binary', text: shown.join(' ') + (all.length > HEX_PREVIEW_BYTES ? ' …' : ''), clipped: false };
}
