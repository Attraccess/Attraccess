export interface DecodedPayload {
  kind: 'json' | 'text' | 'binary';
  text: string;
}

const HEX_PREVIEW_BYTES = 256;

// Shows a payload as pretty JSON, UTF-8 text, or (when it is not text) hex.
export function decodePayload(base64: string): DecodedPayload {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // eslint-disable-next-line no-control-regex
    if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed !== null && typeof parsed === 'object') {
          return { kind: 'json', text: JSON.stringify(parsed, null, 2) };
        }
      } catch {
        // plain text
      }
      return { kind: 'text', text };
    }
  } catch {
    // not UTF-8
  }
  const shown = Array.from(bytes.subarray(0, HEX_PREVIEW_BYTES), (byte) => byte.toString(16).padStart(2, '0'));
  return { kind: 'binary', text: shown.join(' ') + (bytes.length > HEX_PREVIEW_BYTES ? ' …' : '') };
}
