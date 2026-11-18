import type { Client } from './lib/requests/client/index.js';

/**
 * The API answers a `null` result with an empty, untyped 200. The hey-api client turns that into `{}`, which reads as
 * data; v1 of the generated client returned no data. Rewrites such responses to a JSON `null` so callers keep seeing
 * "nothing" (TanStack Query does not accept `undefined` query data).
 */
export function emptyResponsesAsNull(client: Client): void {
  client.interceptors.response.use(async (response) => {
    if (!response.ok || response.status === 204 || response.headers.get('Content-Type')) return response;
    if (await response.clone().text()) return response;

    const headers = new Headers(response.headers);
    headers.delete('Content-Length');
    headers.set('Content-Type', 'application/json');
    return new Response('null', { status: response.status, statusText: response.statusText, headers });
  });
}
