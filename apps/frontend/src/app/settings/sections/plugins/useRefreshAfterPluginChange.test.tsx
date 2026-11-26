import {
  useGetPluginsKey,
  useGetPluginSystemStatusKey,
  usePluginControllerInstalledPackagesKey,
} from '@attraccess/react-query-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useRefreshAfterPluginChange } from './useRefreshAfterPluginChange';

describe('useRefreshAfterPluginChange', () => {
  it('marks the plugin system status and both plugin lists stale, so the restart banner shows at once', async () => {
    const queryClient = new QueryClient();
    const keys = [useGetPluginSystemStatusKey, useGetPluginsKey, usePluginControllerInstalledPackagesKey];
    for (const key of keys) queryClient.setQueryData([key, {}], { cached: true });
    queryClient.setQueryData(['unrelated'], { cached: true });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useRefreshAfterPluginChange(), { wrapper });
    await result.current();

    for (const key of keys) expect(queryClient.getQueryState([key, {}])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
  });
});
