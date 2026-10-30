import { MAX_FAULT_TEXT_BYTES, MAX_REPORT_BYTES, MAX_REPORT_ERRORS } from './limits';
import type { ValidationError } from './types';

const encoder = new TextEncoder();
const byteLength = (value: unknown) => encoder.encode(JSON.stringify(value)).byteLength;

/** Longest per-field text kept for one reported error, so one error can never exhaust a budget alone. */
const MAX_ERROR_PATH_CHARS = 256;
const MAX_ERROR_CODE_CHARS = 64;
const MAX_ERROR_MESSAGE_CHARS = 512;

/** Truncate to at most `maxBytes` of UTF-8 without splitting a character. */
export function truncateUtf8(text: string, maxBytes: number): string {
  // encodeInto stops before a character that does not fit, so it never splits one.
  const { read } = encoder.encodeInto(text, new Uint8Array(maxBytes));
  return read === text.length ? text : text.slice(0, read);
}

/** Shorten to `chars` UTF-16 units including the ellipsis, never ending on half of a surrogate pair. */
export function clip(text: string, chars: number): string {
  if (text.length <= chars) return text;
  let end = chars - 1;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}…`;
}

function boundedError(
  error: ValidationError,
  limits = { path: MAX_ERROR_PATH_CHARS, code: MAX_ERROR_CODE_CHARS, message: MAX_ERROR_MESSAGE_CHARS },
): ValidationError {
  return {
    path: clip(String(error.path), limits.path),
    code: clip(String(error.code), limits.code),
    message: clip(String(error.message), limits.message),
  };
}

/** Text kept for the one error a rejection always reports, even when nothing else fits. */
const MIN_ERROR_LIMITS = { path: 64, code: MAX_ERROR_CODE_CHARS, message: 64 };

/** Keep errors while the count and encoded size stay within the budget; report how many did not fit. */
export function boundErrors(
  errors: ValidationError[],
  maxCount: number,
  maxBytes: number,
): { errors: ValidationError[]; omitted: number } {
  const kept: ValidationError[] = [];
  let used = 2;
  for (const error of errors) {
    if (kept.length >= maxCount) break;
    const candidate = boundedError(error);
    // +1 for the separating comma.
    const size = byteLength(candidate) + 1;
    if (used + size > maxBytes) break;
    used += size;
    kept.push(candidate);
  }
  return { errors: kept, omitted: errors.length - kept.length };
}

/**
 * A rejection report is capped at 50 errors and 64 KiB in total. The envelope is reserved first, so
 * even worst-case error text cannot push the whole message over the limit.
 */
export function boundReport(revision: number, contentHash: string, errors: ValidationError[]) {
  const envelope = byteLength({ revision, contentHash, errors: [], omittedErrors: errors.length });
  const bounded = boundErrors(errors, MAX_REPORT_ERRORS, MAX_REPORT_BYTES - envelope);
  // An empty error list means "accepted", so a rejection keeps one shortened error even when the
  // envelope leaves no room for it.
  const kept = bounded.errors.length || !errors.length ? bounded.errors : [boundedError(errors[0], MIN_ERROR_LIMITS)];
  const omitted = errors.length - kept.length;
  return {
    revision,
    contentHash,
    errors: kept,
    ...(omitted ? { omittedErrors: omitted } : {}),
  };
}

export function boundFaultText(text: string): string {
  return truncateUtf8(text, MAX_FAULT_TEXT_BYTES);
}
