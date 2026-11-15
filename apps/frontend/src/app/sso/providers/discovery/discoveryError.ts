import { ApiError } from '@attraccess/react-query-client';

/**
 * The server's message for a failed discovery, or `undefined` when the error carries none worth showing.
 *
 * Only a JSON error body counts: a reverse proxy may replace the API's 502 body with its own HTML or
 * "Bad Gateway" page, which the client parses as a string, and the transport message is just the status text.
 */
export function getDiscoveryErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;

  const body: unknown = error.body;
  if (typeof body !== 'object' || body === null) return undefined;

  const message: unknown = (body as { message?: unknown }).message;
  const parts = (Array.isArray(message) ? message : [message])
    .filter((part): part is string => typeof part === 'string')
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : undefined;
}
