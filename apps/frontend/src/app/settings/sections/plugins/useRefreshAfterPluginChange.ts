import {
  useGetPluginsKey,
  useGetPluginSystemStatusKey,
  usePluginControllerInstalledPackagesKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Reloads the plugin lists and the plugin system status after an install, replacement, upload or removal, so the
 * tables show the change and the restart banner appears at once.
 */
export function useRefreshAfterPluginChange() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all(
        [useGetPluginSystemStatusKey, useGetPluginsKey, usePluginControllerInstalledPackagesKey].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
    [queryClient],
  );
}
