import { act, renderHook, waitFor } from '@testing-library/react';
import { setApiBaseUrl } from './frontend.api-client';
import { fetchPluginLicense, usePluginLicense } from './frontend.license';

const license = { valid: true, modules: ['wago'], usageLimits: {}, isNonProfit: false };

describe('plugin license access', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(license)));
    vi.stubGlobal('fetch', fetchMock);
    setApiBaseUrl('https://attraccess.example.com');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.__ATTRACCESS_API_BASE_URL__;
  });

  it('reads GET /api/license-data with the session cookie', async () => {
    await expect(fetchPluginLicense()).resolves.toEqual(license);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://attraccess.example.com/api/license-data');
    expect(init.credentials).toBe('include');
  });

  it('exposes the license and answers hasModule', async () => {
    const { result } = renderHook(() => usePluginLicense());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasModule('wago')).toBe(false);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.license).toEqual(license);
    expect(result.current.hasModule('wago')).toBe(true);
    expect(result.current.hasModule('other')).toBe(false);
  });

  it('grants no module of an invalid license', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...license, valid: false })));
    const { result } = renderHook(() => usePluginLicense());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasModule('wago')).toBe(false);
  });

  it('reports a failed request as an error and grants nothing', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"Unauthorized"}', { status: 401 }));
    const { result } = renderHook(() => usePluginLicense());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.message).toBe('Unauthorized');
    expect(result.current.license).toBeNull();
    expect(result.current.hasModule('wago')).toBe(false);
  });

  it('refetches on demand', async () => {
    const { result } = renderHook(() => usePluginLicense());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...license, modules: [] })));
    await act(() => result.current.refetch());
    expect(result.current.hasModule('wago')).toBe(false);
  });
});
