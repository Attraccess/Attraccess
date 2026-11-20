import { emptyResponsesAsNull } from './empty-response';
import type { Client } from './lib/requests/client/index.js';

type ResponseInterceptor = (response: Response) => Promise<Response>;

/** Installs the interceptor on a stand-in client and returns it. */
function installedInterceptor(): ResponseInterceptor {
  let interceptor: ResponseInterceptor | undefined;
  const client = { interceptors: { response: { use: (fn: ResponseInterceptor) => (interceptor = fn) } } };
  emptyResponsesAsNull(client as unknown as Client);
  if (!interceptor) throw new Error('emptyResponsesAsNull installed no response interceptor');
  return interceptor;
}

describe('emptyResponsesAsNull', () => {
  const intercept = installedInterceptor();

  it('turns an empty, untyped 200 (a null result) into a JSON null', async () => {
    const response = await intercept(new Response(null, { status: 200, headers: { 'Content-Length': '0' } }));

    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Content-Length')).toBeNull();
    await expect(response.json()).resolves.toBeNull();
  });

  it('leaves typed, non-empty, 204 and failed responses unchanged', async () => {
    const json = new Response('{"id":1}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    const text = new Response('ok', { status: 200 });
    const noContent = new Response(null, { status: 204 });
    const failed = new Response(null, { status: 404 });

    expect(await intercept(json)).toBe(json);
    expect(await intercept(text)).toBe(text);
    expect(await intercept(noContent)).toBe(noContent);
    expect(await intercept(failed)).toBe(failed);
  });
});
