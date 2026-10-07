import { LoadedPluginManifest } from '@attraccess/react-query-client';
import { useCallback, useEffect } from 'react';
// The federation runtime is injected by Vite.
// @ts-expect-error -- Vite supplies the virtual federation module at build time.
import { __federation_method_getRemote, __federation_method_setRemote } from 'virtual:__federation__';
import { AttraccessFrontendPlugin, AttraccessFrontendPluginAuthData } from '@attraccess/plugins-frontend-sdk';
import { getBaseUrl } from '../../api';
import { pluginStore } from './plugin-provider.plugin-store';
import type { usePluginProviderStateInputs } from './usePluginProviderStateInputs';

export function usePluginProviderStateLoadPlugin(model: ReturnType<typeof usePluginProviderStateInputs>) {
  const { addPlugin, isInstalled } = model;
  const loadPlugin = useCallback(
    async (pluginManifest: LoadedPluginManifest, plugin?: AttraccessFrontendPlugin) => {
      try {
        if (!plugin) {
          console.debug(`Attraccess Plugin System: loading plugin ${pluginManifest.name}`);
          const entryPointFile = pluginManifest.main.frontend?.entryPoint;

          if (!entryPointFile) {
            console.debug(
              `Attraccess Plugin System: Plugin ${pluginManifest.name} has no entry point file for frontend, skipping`,
            );
            return;
          }

          const baseUrl = getBaseUrl();
          const pluginUrlPath = `${baseUrl}/api/plugins/${encodeURIComponent(pluginManifest.name)}/frontend/module-federation`;
          // The federation runtime re-`import()`s this exact URL string on every
          // reload; without a version tag a new build reuses the browser's cached
          // module for the old one and the upgrade silently never takes effect.
          const versionTag = `v=${encodeURIComponent(pluginManifest.version)}`;
          const remoteUrl = `${pluginUrlPath}/${entryPointFile}?${versionTag}`;

          // Plugins bundle their own CSS (e.g. their Tailwind utilities); the
          // federation remote only carries JS, so inject the stylesheet here.
          const stylesFile = pluginManifest.main.frontend?.styles;
          if (stylesFile) {
            const linkId = `plugin-styles-${pluginManifest.name}`;
            const existingLink = document.getElementById(linkId);
            if (existingLink) existingLink.remove();
            const link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            link.href = `${pluginUrlPath}/${stylesFile}?${versionTag}`;
            document.head.appendChild(link);
          }

          __federation_method_setRemote(pluginManifest.name, {
            url: () => Promise.resolve(remoteUrl),
            format: 'esm',
            from: 'vite',
          });

          let pluginClass = await __federation_method_getRemote(pluginManifest.name, './plugin');

          if (pluginClass.default) {
            pluginClass = pluginClass.default;
          }

          // Initialize the plugin
          plugin = new pluginClass() as AttraccessFrontendPlugin;
        }

        const pluginName = plugin.getPluginName();
        console.debug(`Attraccess Plugin System: Checking if plugin ${pluginName} is installed`);
        if (isInstalled(pluginName)) {
          console.debug(`Attraccess Plugin System: Plugin ${pluginName} is already installed, uninstalling first`);
          pluginStore.uninstall(pluginName);
        }

        pluginStore.install(plugin);

        const fullPlugin = {
          ...pluginManifest,
          plugin,
        };
        addPlugin(fullPlugin);

        console.debug(`Attraccess Plugin System: Plugin ${pluginName} loaded`);
        return fullPlugin;
      } catch (error) {
        console.error(`Attraccess Plugin System: Failed to load plugin: ${pluginManifest.name}`, error);
      }
    },
    [addPlugin, isInstalled],
  );

  useEffect(() => {
    model.plugins.forEach((plugin) => {
      plugin.plugin.onApiEndpointChange(getBaseUrl());
      plugin.plugin.onApiAuthStateChange({
        authToken: '', // No longer using tokens - authentication is handled by cookies
        user: model.user as unknown as AttraccessFrontendPluginAuthData['user'],
      });
    });
  }, [model.plugins, model.user]);
  return { ...model, loadPlugin } as const;
}
