import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { OpenAPI, useUsersServiceUpdateMyDateTimePreferences } from '@attraccess/react-query-client';
import { configureApiClient } from './index';

const originalConfig = { ...OpenAPI };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.assign(OpenAPI, originalConfig);
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
  // Session authentication enables this in useAuth before account settings load.
  OpenAPI.WITH_CREDENTIALS = true;
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUsersServiceUpdateMyDateTimePreferences(), { wrapper });

  try {
    await act(async () => {
      const response = await result.current.mutateAsync({ requestBody: { dateTimeLocale } });
      expect(response).toEqual(updatedUser);
      expect(response.dateTimeLocale).toBe(dateTimeLocale);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      `${OpenAPI.BASE}/api/users/me/date-time-preferences`,
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        body: JSON.stringify({ dateTimeLocale }),
      }),
    );
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get('Content-Type')).toBe('application/json');
  } finally {
    client.clear();
  }
});
