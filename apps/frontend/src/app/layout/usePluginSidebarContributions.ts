import { useMemo } from 'react';
import usePluginState from '../plugins/plugin.state';
import type { PluginSidebarGroup, PluginSidebarItem } from '@attraccess/plugins-frontend-sdk';
export function usePluginSidebarContributions() {
  const model = usePluginState();
  // Sidebar entries contributed by installed frontend plugins. Each plugin's
  // getSidebarItems() is optional and isolated so a throwing plugin can't break
  // the shell. Visibility is still gated by the target route's auth below.
  const pluginNavItems: PluginSidebarItem[] = useMemo(() => {
    return model.plugins.flatMap((manifest) => {
      try {
        return manifest.plugin.getSidebarItems?.() ?? [];
      } catch (error) {
        // eslint-disable-next-line no-console -- Report isolated plugin failures without breaking navigation.
        console.error(
          `Attraccess Plugin System: getSidebarItems() of plugin "${manifest.plugin.getPluginName()}" threw`,
          error,
        );
        return [];
      }
    });
  }, [model.plugins]);

  const pluginNavGroups: PluginSidebarGroup[] = useMemo(() => {
    return model.plugins.flatMap((manifest) => {
      try {
        return manifest.plugin.getSidebarGroups?.() ?? [];
      } catch (error) {
        // eslint-disable-next-line no-console -- Report isolated plugin failures without breaking navigation.
        console.error(
          `Attraccess Plugin System: getSidebarGroups() of plugin "${manifest.plugin.getPluginName()}" threw`,
          error,
        );
        return [];
      }
    });
  }, [model.plugins]);

  return { pluginNavItems, pluginNavGroups };
}
