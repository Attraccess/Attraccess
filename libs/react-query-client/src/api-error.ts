import type { Client } from './lib/requests/client/index.js';

/** The request an `ApiError` belongs to. */
export interface ApiRequestOptions {
  readonly method: string;
  readonly url: string;
}

/** The failed response an `ApiError` carries; `body` is the parsed JSON (or text) the server sent. */
export interface ApiResult<TBody = unknown> {
  readonly body: TBody;
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
}

/** Thrown by the generated hooks and SDK functions for every non-2xx response (see `throwApiErrors`). */
export class ApiError extends Error {
  public readonly url: string;
  public readonly status: number;
  public readonly statusText: string;
  public readonly body: unknown;
  public readonly request: ApiRequestOptions;

  constructor(request: ApiRequestOptions, response: ApiResult, message: string) {
    super(message);

    this.name = 'ApiError';
    this.url = response.url;
    this.status = response.status;
    this.statusText = response.statusText;
    this.body = response.body;
    this.request = request;
  }
}

/**
 * The hey-api client throws the bare response body. Wraps it in an `ApiError` so callers keep the HTTP status;
 * network failures (no response) and errors of successful responses pass through unchanged.
 */
export function throwApiErrors(client: Client): void {
  client.interceptors.error.use((error, response, request) => {
    if (!response || response.ok || error instanceof ApiError) return error;
    return new ApiError(
      { method: request?.method ?? 'GET', url: request?.url ?? response.url },
      { url: response.url, ok: response.ok, status: response.status, statusText: response.statusText, body: error },
      response.statusText || `Request failed with status ${response.status}`,
    );
  });
}
