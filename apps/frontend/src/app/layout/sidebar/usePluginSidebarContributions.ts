import { useEffect, useMemo, useState } from 'react';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import type { PluginSidebarGroup, PluginSidebarItem } from '@attraccess/plugins-frontend-sdk';
import { useAuth } from '../../../hooks/useAuth';
import usePluginState from '../../plugins/plugin.state';

export function usePluginSidebarContributions() {
  const model = usePluginState();
  const { user } = useAuth();
  const language = useTranslationState((state) => state.language);
  // Plugins build their entries from the account (permissions, language), so re-read them when either changes or a
  // plugin reports a change of its own (e.g. after an async check).
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const unsubscribe = model.plugins.map((manifest) =>
      manifest.plugin.onSidebarItemsChange?.(() => setRevision((current) => current + 1)),
    );
    return () => unsubscribe.forEach((stop) => stop?.());
  }, [model.plugins]);
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
  }, [model.plugins, user, language, revision]);

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
