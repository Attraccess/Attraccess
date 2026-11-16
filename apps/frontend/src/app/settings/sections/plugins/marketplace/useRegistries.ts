import { usePluginsServicePluginControllerListRegistries } from '@attraccess/react-query-client';

/** The configured plugin registries; loaded once rather than on every window focus. */
export function useRegistries() {
  return usePluginsServicePluginControllerListRegistries(undefined, { retry: false, refetchOnWindowFocus: false });
}
