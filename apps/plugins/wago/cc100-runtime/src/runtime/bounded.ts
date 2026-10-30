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
  if (encoder.encode(text).byteLength <= maxBytes) return text;
  let end = Math.min(text.length, maxBytes);
  while (end > 0 && encoder.encode(text.slice(0, end)).byteLength > maxBytes) end -= 1;
  // Never end on half of a surrogate pair.
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

const clip = (text: string, chars: number) => (text.length > chars ? `${text.slice(0, chars - 1)}…` : text);

function boundedError(error: ValidationError): ValidationError {
  return {
    path: clip(String(error.path), MAX_ERROR_PATH_CHARS),
    code: clip(String(error.code), MAX_ERROR_CODE_CHARS),
    message: clip(String(error.message), MAX_ERROR_MESSAGE_CHARS),
  };
}

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
  return {
    revision,
    contentHash,
    errors: bounded.errors,
    ...(bounded.omitted ? { omittedErrors: bounded.omitted } : {}),
  };
}

export function boundFaultText(text: string): string {
  return truncateUtf8(text, MAX_FAULT_TEXT_BYTES);
}
