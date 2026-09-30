import { createPluginApiClient, PluginApiError, setApiBaseUrl } from './frontend.api-client';

function respond(body: string | null, init: ResponseInit = {}) {
  return Promise.resolve(new Response(body, init));
}

describe('createPluginApiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockReturnValue(respond('{}'));
    vi.stubGlobal('fetch', fetchMock);
    setApiBaseUrl('https://attraccess.example.com');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.__ATTRACCESS_API_BASE_URL__;
  });

  it('resolves paths against the host API origin and sends the session cookie', async () => {
    await createPluginApiClient('/api/demo').request('/things');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://attraccess.example.com/api/demo/things');
    expect(init.credentials).toBe('include');
  });

  it('falls back to the current origin when the host published nothing', async () => {
    delete window.__ATTRACCESS_API_BASE_URL__;

    await createPluginApiClient('/api/demo').request('/things');

    expect(fetchMock.mock.calls[0][0]).toBe(`${window.location.origin}/api/demo/things`);
  });

  it('serialises JSON bodies and drops empty query values', async () => {
    await createPluginApiClient('/api/demo').request('/things', {
      method: 'PUT',
      body: { name: 'x' },
      query: { vhost: '/', refresh: undefined },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://attraccess.example.com/api/demo/things?vhost=%2F');
    expect(init.body).toBe('{"name":"x"}');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('resolves empty responses to null instead of failing to parse', async () => {
    fetchMock.mockReturnValue(respond(null, { status: 204 }));

    await expect(createPluginApiClient().request('/api/demo/things', { method: 'DELETE' })).resolves.toBeNull();
  });

  it('throws the backend error message with its status', async () => {
    fetchMock.mockReturnValue(
      respond(JSON.stringify({ message: ['broker unreachable', 'retry later'] }), { status: 502 })
    );

    await expect(createPluginApiClient().request('/api/demo/things')).rejects.toThrow(
      new PluginApiError('broker unreachable, retry later', 502)
    );
  });

  it('falls back to a status message when the error body is not JSON', async () => {
    fetchMock.mockReturnValue(respond('<html>gateway</html>', { status: 503 }));

    await expect(createPluginApiClient().request('/api/demo/things')).rejects.toMatchObject({
      message: 'Request failed (HTTP 503).',
      status: 503,
    });
  });
});
