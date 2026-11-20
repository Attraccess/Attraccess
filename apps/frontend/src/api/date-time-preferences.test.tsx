import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { client as apiClient, useUpdateMyDateTimePreferences } from '@attraccess/react-query-client';
import { configureApiClient } from './index';

const originalConfig = apiClient.getConfig();

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  apiClient.setConfig(originalConfig);
});

it.each(['en-GB', null])('saves %s through the generated mutation with session credentials', async (dateTimeLocale) => {
  const updatedUser = { id: 1, locale: 'de', dateTimeLocale };
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify(updatedUser), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
  vi.stubGlobal('fetch', fetchMock);
  configureApiClient();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUpdateMyDateTimePreferences(), { wrapper });

  try {
    await act(async () => {
      const response = await result.current.mutateAsync({ body: { dateTimeLocale } });
      expect(response).toEqual(updatedUser);
      expect(response.dateTimeLocale).toBe(dateTimeLocale);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const request: Request = fetchMock.mock.calls[0][0];
    expect(request.url).toBe(`${apiClient.getConfig().baseUrl}/api/users/me/date-time-preferences`);
    expect(request.method).toBe('PATCH');
    expect(request.credentials).toBe('include');
    expect(await request.text()).toBe(JSON.stringify({ dateTimeLocale }));
    expect(request.headers.get('Content-Type')).toBe('application/json');
  } finally {
    client.clear();
  }
});
