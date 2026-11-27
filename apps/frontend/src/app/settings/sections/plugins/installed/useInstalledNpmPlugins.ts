import {
  type InstalledNpmPluginDto,
  usePluginControllerInstalledPackages,
  UsePluginControllerInstalledPackagesKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

/**
 * The npm-installed plugins by name and by install directory, plus a way to merge fresher records (update checks, policy saves) into the cache.
 * The list is loaded once per visit of the section and a failed load reads as no installed packages: within a visit it
 * only changes through this section, which merges the records it gets back, reloads it after an install or
 * replacement (`useRefreshAfterPluginChange`) and reloads the page after a removal. Leaving the section drops the cache (gcTime 0), so the next visit loads it again.
 */
export function useInstalledNpmPlugins() {
  const queryClient = useQueryClient();
  const { data } = usePluginControllerInstalledPackages({}, undefined, {
    staleTime: Infinity,
    gcTime: 0,
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
  // A listed plugin is the npm package installed in its directory. Matching by name would mistake a ZIP copy (such
  // as a refused 1.x build) for the npm package of the same name, and its removal would remove that package.
  const installedByDirectory = useMemo(
    () => new Map(installed.map((plugin) => [plugin.installPath, plugin] as const)),
    [installed],
  );

  const mergeInstalled = useCallback(
    (updated: InstalledNpmPluginDto[]) => {
      queryClient.setQueryData<InstalledNpmPluginDto[]>(UsePluginControllerInstalledPackagesKeyFn(), (current = []) => {
        const merged = new Map(current.map((plugin) => [plugin.name, plugin] as const));
        for (const plugin of updated) merged.set(plugin.name, plugin);
        return [...merged.values()];
      });
    },
    [queryClient],
  );

  return { installed, installedByName, installedByDirectory, mergeInstalled };
}
