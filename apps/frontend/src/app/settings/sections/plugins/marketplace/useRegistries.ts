import { usePluginsServicePluginControllerListRegistries } from '@attraccess/react-query-client';

/**
 * The configured plugin registries, loaded once: opening the marketplace or returning from a package's details reuses
 * the cached list (or the cached failure) instead of loading it again. Adding or removing a registry reloads it
 * explicitly.
 */
export function useRegistries() {
  return usePluginsServicePluginControllerListRegistries(undefined, {
    staleTime: Infinity,
    // An errored query without data would otherwise load again whenever another component starts reading it.
    retryOnMount: false,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
