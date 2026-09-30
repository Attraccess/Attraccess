// Preconfigured API client for plugin frontends (ATT-795).
//
// Every plugin used to hand-roll the same fetch wrapper: prefix `/api`, send
// cookies, serialise JSON, dig the message out of the error body. This is that
// wrapper, once, so plugins only describe what differs (path, method, body).
//
// The base URL comes from the host: it publishes it on `window` (see
// apps/frontend/src/app/plugins/plugin-provider.tsx) before it loads any plugin
// bundle. Plugins get their own copy of this SDK — module federation only
// shares react & friends — so a window global, not a module singleton, is what
// crosses the bundle boundary.

const BASE_URL_GLOBAL = '__ATTRACCESS_API_BASE_URL__';

declare global {
  interface Window {
    [BASE_URL_GLOBAL]?: string;
  }
}

/** The API origin the host is talking to. Falls back to the current origin. */
export function getApiBaseUrl(): string {
  return window[BASE_URL_GLOBAL] ?? window.location.origin;
}

/** Called by the host on boot. Plugins should not need this. */
export function setApiBaseUrl(baseUrl: string): void {
  window[BASE_URL_GLOBAL] = baseUrl;
}

/** Thrown for any non-2xx response, carrying the status for callers that branch on it. */
export class PluginApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'PluginApiError';
  }
}

export interface PluginApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** Serialised as JSON with the matching Content-Type. */
  body?: unknown;
  /** Appended as a query string; `undefined`/`null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
}

export interface PluginApiClient {
  /** Absolute URL for a path below the client's base path. */
  url(path: string, query?: PluginApiRequestOptions['query']): string;
  /** JSON in, JSON out. Throws PluginApiError on non-2xx. Empty bodies resolve to null. */
  request<T>(path: string, options?: PluginApiRequestOptions): Promise<T>;
  /** Escape hatch: raw Response, still preconfigured (base URL + cookies). */
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

// The backend wraps failures in HTTP exceptions whose `message` explains what
// went wrong (broker unreachable, missing privileges, …) — surface that text
// instead of a bare status code.
async function toError(res: Response): Promise<PluginApiError> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    if (message) {
      return new PluginApiError(message, res.status);
    }
  } catch {
    // Non-JSON error body — fall through to the generic message.
  }
  return new PluginApiError(`Request failed (HTTP ${res.status}).`, res.status);
}

/**
 * Creates a client bound to `basePath`, which is resolved against the host's
 * API origin. Plugin routes are mounted under `/api/<plugin-name>`, so that is
 * the usual argument; pass nothing to address the host API directly.
 */
export function createPluginApiClient(basePath = ''): PluginApiClient {
  const url: PluginApiClient['url'] = (path, query) => {
    const target = new URL(`${basePath}${path}`, getApiBaseUrl());
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        target.searchParams.set(key, String(value));
      }
    });
    return target.toString();
  };

  // Cookies carry the session, so credentials are included on every call.
  const doFetch: PluginApiClient['fetch'] = (path, init) =>
    fetch(url(path), { credentials: 'include', ...init });

  return {
    url,
    fetch: doFetch,
    async request<T>(path: string, options: PluginApiRequestOptions = {}): Promise<T> {
      const { body, query, headers, ...init } = options;

      const res = await fetch(url(path, query), {
        credentials: 'include',
        ...init,
        headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (!res.ok) {
        throw await toError(res);
      }

      // 204s and empty bodies are normal for DELETE/PUT — don't make callers guard.
      const text = await res.text();
      return (text.length > 0 ? JSON.parse(text) : null) as T;
    },
  };
}
