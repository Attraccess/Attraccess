import { usePluginsServicePluginControllerListRegistries } from '@attraccess/react-query-client';

/**
 * The configured plugin registries, loaded once per visit of the plugins section: opening the marketplace or returning
 * from a package's details reuses the cached list (or the cached failure) instead of loading it again. Adding or
 * removing a registry reloads it explicitly. Leaving the section drops the cache (gcTime 0), so the next visit loads
 * the list again.
 */
export function useRegistries() {
  return usePluginsServicePluginControllerListRegistries(undefined, {
    staleTime: Infinity,
    gcTime: 0,
    // An errored query without data would otherwise load again whenever another component starts reading it.
    retryOnMount: false,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
