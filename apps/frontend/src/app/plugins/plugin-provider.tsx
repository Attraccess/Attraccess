import { LoadedPluginManifest, usePluginsServiceGetPlugins } from '@attraccess/react-query-client';
import { PropsWithChildren, useCallback, useEffect, useRef } from 'react';
import { createPluginStore, PluginProvider as PluginProviderBase, RendererPlugin } from 'react-pluggable';
import usePluginState from './plugin.state';
import {
  __federation_method_getRemote,
  __federation_method_setRemote,
  // eslint-disable-next-line
  // @ts-ignore
} from 'virtual:__federation__';
import { AttraccessFrontendPlugin, AttraccessFrontendPluginAuthData } from '@attraccess/plugins-frontend-sdk';
import { ToastType, useToastMessage } from '../../components/toastProvider';
import { useAuth } from '../../hooks/useAuth';
import { getBaseUrl } from '../../api';

const pluginStore = createPluginStore();
export function PluginProvider(props: PropsWithChildren) {
  const { refetch: refetchPlugins } = usePluginsServiceGetPlugins();
  const { addPlugin, isInstalled, plugins } = usePluginState();
  const toast = useToastMessage();
  const { user } = useAuth();

  // Add refs to track initialization state
  const isPluginSystemInitialized = useRef(false);
  const arePluginsLoaded = useRef(false);

  useEffect(() => {
    if (isPluginSystemInitialized.current) return;
    isPluginSystemInitialized.current = true;

    console.debug('Attraccess Plugin System: initializing');

    console.debug('Attraccess Plugin System: installing renderer plugin');
    const rendererPlugin = new RendererPlugin();
    pluginStore.install(rendererPlugin);

    console.debug('Attraccess Plugin System: adding notificationToast function');
    pluginStore.addFunction(
      'notificationToast',
      (params: { title: string; description: string; type: ToastType; duration?: number }) => {
        toast.showToast({
          title: params.title,
          description: params.description,
          type: params.type,
          duration: params.duration,
        });
      }
    );

    return () => {
      console.debug('Attraccess Plugin System: uninstalling renderer plugin');
      pluginStore.uninstall(rendererPlugin.getPluginName());

      console.debug('Attraccess Plugin System: removing notificationToast function');
      pluginStore.removeFunction('notificationToast');

      // Reset the initialization state on unmount
      isPluginSystemInitialized.current = false;
    };
  }, [toast]);

  const loadPlugin = useCallback(
    async (pluginManifest: LoadedPluginManifest, plugin?: AttraccessFrontendPlugin) => {
      try {
        if (!plugin) {
          console.debug(`Attraccess Plugin System: loading plugin ${pluginManifest.name}`);
          const entryPointFile = pluginManifest.main.frontend?.entryPoint;

          if (!entryPointFile) {
            console.debug(
              `Attraccess Plugin System: Plugin ${pluginManifest.name} has no entry point file for frontend, skipping`
            );
            return;
          }

          const baseUrl = getBaseUrl();
          const remoteUrl = `${baseUrl}/api/plugins/${pluginManifest.name}/frontend/module-federation/${entryPointFile}`;

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

        await new Promise((resolve) => setTimeout(resolve, 200));
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
    [addPlugin, isInstalled]
  );

  useEffect(() => {
    plugins.forEach((plugin) => {
      plugin.plugin.onApiEndpointChange(getBaseUrl());
      plugin.plugin.onApiAuthStateChange({
        authToken: '', // No longer using tokens - authentication is handled by cookies
        user: user as unknown as AttraccessFrontendPluginAuthData['user'],
      });
    });
  }, [plugins, user]);

  const loadAllPlugins = useCallback(async () => {
    if (arePluginsLoaded.current) return;
    console.debug('Attraccess Plugin System: Loading all plugins');

    const plugins = await refetchPlugins();
    const pluginsArray = plugins.data ?? [];
    await Promise.all(pluginsArray.map((manifest) => loadPlugin(manifest)));

    arePluginsLoaded.current = true;
    console.debug('Attraccess Plugin System: All plugins loaded');
  }, [loadPlugin, refetchPlugins]);

  useEffect(() => {
    if (arePluginsLoaded.current) return;
    console.debug('Attraccess Plugin System: Refetching plugins');
    loadAllPlugins();

    // We're using the ref as our control mechanism, so the dependency array can be empty
    // to ensure this only runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <PluginProviderBase pluginStore={pluginStore}>{props.children}</PluginProviderBase>;
}
