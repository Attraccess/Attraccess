import type { ApiError } from '@attraccess/react-query-client';

/** Seconds to wait before retrying (a 429's `body.retryAfterSeconds`), or '' so a "{{retryAfterSeconds}}" placeholder renders empty. */
export function getRetryAfterSeconds(error: ApiError | Error): number | '' {
  const seconds = Number(((error as ApiError).body as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : '';
}
