import {
  type InstalledNpmPluginDto,
  usePluginsServicePluginControllerInstalledPackages,
  UsePluginsServicePluginControllerInstalledPackagesKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

/**
 * The npm-installed plugins by name, plus a way to merge fresher records (update checks, policy saves) into the cache.
 * The list is loaded once and a failed load reads as no installed packages: it only changes through this section,
 * which merges the records it gets back or reloads the page after an install, replacement or removal.
 */
export function useInstalledNpmPlugins() {
  const queryClient = useQueryClient();
  const { data } = usePluginsServicePluginControllerInstalledPackages(undefined, {
    staleTime: Infinity,
    retryOnMount: false,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const installed = useMemo(() => data ?? [], [data]);
  const installedByName = useMemo(
    () => new Map(installed.map((plugin) => [plugin.name, plugin] as const)),
    [installed],
  );

  const mergeInstalled = useCallback(
    (updated: InstalledNpmPluginDto[]) => {
      queryClient.setQueryData<InstalledNpmPluginDto[]>(
        UsePluginsServicePluginControllerInstalledPackagesKeyFn(),
        (current = []) => {
          const merged = new Map(current.map((plugin) => [plugin.name, plugin] as const));
          for (const plugin of updated) merged.set(plugin.name, plugin);
          return [...merged.values()];
        },
      );
    },
    [queryClient],
  );

  return { installed, installedByName, mergeInstalled };
}
