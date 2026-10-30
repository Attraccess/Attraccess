const REDACTED = '[redacted]';

/**
 * Copy of a websocket payload that is safe to log: every `token` key (any case, any depth) is replaced, so
 * reader credentials (READER_REGISTER, READER_AUTHENTICATE) never end up in debug logs.
 */
export function redactTokens<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => redactTokens(item)) as T;
  if (value === null || typeof value !== 'object' || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, key.toLowerCase() === 'token' ? REDACTED : redactTokens(entry)]),
  ) as T;
}
