export interface DecodedPayload {
  kind: 'json' | 'text' | 'binary';
  text: string;
  // The shown text was cut to keep the log responsive.
  clipped: boolean;
}

const HEX_PREVIEW_BYTES = 256;
// Longest text a log row shows; the backend already caps payloads at 64 KiB.
export const MAX_DISPLAY_CHARS = 8 * 1024;

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

// Shows a payload as pretty JSON, UTF-8 text, or (when it is not text) hex. A
// truncated payload is never pretty-printed: its JSON is incomplete anyway.
export function decodePayload(base64: string, truncated = false): DecodedPayload {
  const binary = atob(base64);
  const all = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const bytes = truncated ? trimIncompleteUtf8(all) : all;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // eslint-disable-next-line no-control-regex
    if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
      if (!truncated) {
        try {
          const parsed: unknown = JSON.parse(text);
          if (parsed !== null && typeof parsed === 'object') return clip('json', JSON.stringify(parsed, null, 2));
        } catch {
          // plain text
        }
      }
      return clip('text', text);
    }
  } catch {
    // not UTF-8
  }
  const shown = Array.from(all.subarray(0, HEX_PREVIEW_BYTES), (byte) => byte.toString(16).padStart(2, '0'));
  return { kind: 'binary', text: shown.join(' ') + (all.length > HEX_PREVIEW_BYTES ? ' …' : ''), clipped: false };
}
