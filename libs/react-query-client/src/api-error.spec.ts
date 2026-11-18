import { ApiError, throwApiErrors } from './api-error';
import type { Client } from './lib/requests/client/index.js';

type ErrorInterceptor = (error: unknown, response?: Response, request?: Request) => unknown;

/** Installs the interceptor on a stand-in client and returns it. */
function installedInterceptor(): ErrorInterceptor {
  let interceptor: ErrorInterceptor | undefined;
  const client = { interceptors: { error: { use: (fn: ErrorInterceptor) => (interceptor = fn) } } };
  throwApiErrors(client as unknown as Client);
  if (!interceptor) throw new Error('throwApiErrors installed no error interceptor');
  return interceptor;
}

describe('throwApiErrors', () => {
  const intercept = installedInterceptor();
  const request = new Request('http://localhost/api/users/7', { method: 'PATCH' });

  it('wraps a failed response in an ApiError that keeps status, body and request', () => {
    const body = { message: 'Not found' };
    const response = new Response(null, { status: 404, statusText: 'Not Found' });

    const error = intercept(body, response, request);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      name: 'ApiError',
      message: 'Not Found',
      status: 404,
      statusText: 'Not Found',
      body,
      request: { method: 'PATCH', url: 'http://localhost/api/users/7' },
    });
  });

  it('names a known status without relying on the status text, which HTTP/2 leaves empty', () => {
    const error = intercept({ message: 'Reader not found' }, new Response(null, { status: 404 }), request) as ApiError;

    expect(error.message).toBe('Not Found');
    expect(error.statusText).toBe('');
  });

  it('falls back to the status for a status without a known name', () => {
    const error = intercept('boom', new Response(null, { status: 418 }), undefined) as ApiError;

    expect(error.message).toBe('Request failed with status 418');
    expect(error.request.method).toBe('GET');
    expect(error.body).toBe('boom');
  });

  it('passes network failures, errors of successful responses and ApiErrors through unchanged', () => {
    const network = new TypeError('fetch failed');
    const parse = new SyntaxError('Unexpected token');
    const existing = new ApiError(
      { method: 'GET', url: '/x' },
      { url: '/x', ok: false, status: 400, statusText: '', body: null },
      'x',
    );

    expect(intercept(network, undefined, request)).toBe(network);
    expect(intercept(parse, new Response('{', { status: 200 }), request)).toBe(parse);
    expect(intercept(existing, new Response(null, { status: 400 }), request)).toBe(existing);
  });
});
