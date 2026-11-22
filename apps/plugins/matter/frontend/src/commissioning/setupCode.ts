// Local validation of a Matter setup code before any request: the manual code (11 or 21 digits, Verhoeff check digit)
// and the QR payload (`MT:` plus base38 text). The server validates again; this only keeps a typo off the network.

// Verhoeff tables (multiplication, permutation).
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;

/** True when the last digit is the Verhoeff check digit of the digits before it. */
export function verhoeffValid(digits: string): boolean {
  let check = 0;
  const reversed = [...digits].reverse();
  for (let index = 0; index < reversed.length; index += 1) {
    check = D[check][P[index % 8][Number(reversed[index])]];
  }
  return check === 0;
}

export type SetupCodeProblem = 'empty' | 'format' | 'checksum';
export type SetupCodeResult =
  { ok: true; code: string; problem?: undefined } | { ok: false; problem: SetupCodeProblem };

/** A real payload is a few dozen characters; the upper bound keeps pasted junk off the network. */
const QR_PAYLOAD = /^MT:[A-Z0-9.-]{10,512}$/;

/**
 * Normalizes what a person typed, pasted or scanned: spaces and hyphens inside a manual code are dropped, a QR payload
 * is trimmed. Returns the code the request carries, or why it cannot be one.
 */
export function parseSetupCode(raw: string): SetupCodeResult {
  const text = raw.trim();
  if (text === '') return { ok: false, problem: 'empty' };
  if (/^MT:/i.test(text)) {
    const payload = `MT:${text.slice(3).toUpperCase()}`;
    return QR_PAYLOAD.test(payload) ? { ok: true, code: payload } : { ok: false, problem: 'format' };
  }
  const digits = text.replaceAll(/[\s-]/g, '');
  if (!/^[0-9]+$/.test(digits) || (digits.length !== 11 && digits.length !== 21)) {
    return { ok: false, problem: 'format' };
  }
  return verhoeffValid(digits) ? { ok: true, code: digits } : { ok: false, problem: 'checksum' };
}
