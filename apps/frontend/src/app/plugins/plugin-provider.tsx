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
import {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  setApiBaseUrl,
} from '@attraccess/plugins-frontend-sdk';
import { ToastType, useToastMessage } from '../../components/toastProvider';
import { useAuth } from '../../hooks/useAuth';
import { getBaseUrl } from '../../api';

const pluginStore = createPluginStore();
export function PluginProvider(props: PropsWithChildren) {
  const { refetch: refetchPlugins } = usePluginsServiceGetPlugins();
  const addPlugin = usePluginState((s) => s.addPlugin);
  const removePlugin = usePluginState((s) => s.removePlugin);
  const isInstalled = usePluginState((s) => s.isInstalled);
  const plugins = usePluginState((s) => s.plugins);
  const toast = useToastMessage();
  const { user } = useAuth();

  const toastRef = useRef(toast);
  toastRef.current = toast;

  const arePluginsLoaded = useRef(false);
  const loadingPlugins = useRef(false);
  const loadedManifests = useRef(new Map<string, string>());
  const warnedFailures = useRef(new Set<string>());

  useEffect(() => {
    console.debug('Attraccess Plugin System: initializing');

    // Publish the API origin before any plugin bundle loads, so the SDK's
    // preconfigured client (createPluginApiClient) knows where to send requests.
    setApiBaseUrl(getBaseUrl());

    console.debug('Attraccess Plugin System: installing renderer plugin');
    const rendererPlugin = new RendererPlugin();
    pluginStore.install(rendererPlugin);

    console.debug('Attraccess Plugin System: adding notificationToast function');
    pluginStore.addFunction(
      'notificationToast',
      (params: { title: string; description: string; type: ToastType; duration?: number }) => {
        toastRef.current.showToast({
          title: params.title,
          description: params.description,
          type: params.type,
          duration: params.duration,
        });
      },
    );

    return () => {
      console.debug('Attraccess Plugin System: uninstalling renderer plugin');
      pluginStore.uninstall(rendererPlugin.getPluginName());

      console.debug('Attraccess Plugin System: removing notificationToast function');
      pluginStore.removeFunction('notificationToast');
    };
  }, []);

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
    plugins.forEach((plugin) => {
      plugin.plugin.onApiEndpointChange(getBaseUrl());
      plugin.plugin.onApiAuthStateChange({
        authToken: '', // No longer using tokens - authentication is handled by cookies
        user: user as unknown as AttraccessFrontendPluginAuthData['user'],
      });
    });
  }, [plugins, user]);

  const loadAllPlugins = useCallback(async () => {
    if (loadingPlugins.current) return;
    loadingPlugins.current = true;
    console.debug('Attraccess Plugin System: Loading all plugins');

    try {
      const plugins = await refetchPlugins();
      const pluginsArray = plugins.data ?? [];
      const failedPlugins = pluginsArray.filter((manifest) => manifest.status === 'error');
      for (const plugin of failedPlugins) {
        const key = `${plugin.name}@${plugin.version}`;
        if (warnedFailures.current.has(key)) continue;
        warnedFailures.current.add(key);
        toastRef.current.warning({
          title: `Plugin "${plugin.name}" is disabled`,
          description: plugin.error ?? 'The plugin failed to load. Open Settings > Plugins for details.',
        });
      }
      const outcomes = new Map<string, boolean>();
      const loadManifest = async (manifest: LoadedPluginManifest, path: string[] = []): Promise<boolean> => {
        if (outcomes.has(manifest.name)) return outcomes.get(manifest.name);
        let failure: string | null = manifest.status === 'error' ? (manifest.error ?? 'Plugin failed to load') : null;
        if (path.includes(manifest.name)) failure = `Plugin dependency cycle: ${[...path, manifest.name].join(' → ')}`;
        if (!failure) {
          for (const dependency of manifest.dependencies ?? []) {
            if (!dependency.required) continue;
            const required = pluginsArray.find((plugin) => plugin.name === dependency.name);
            if (!required || !(await loadManifest(required, [...path, manifest.name]))) {
              failure = `Required plugin ${dependency.name} failed to load; ${manifest.name} is inactive.`;
              break;
            }
          }
        }
        const key = `${manifest.name}@${manifest.version}`;
        if (!failure && manifest.main.frontend && loadedManifests.current.get(manifest.name) !== manifest.version) {
          if (await loadPlugin(manifest)) {
            loadedManifests.current.set(manifest.name, manifest.version);
            warnedFailures.current.delete(key);
          } else failure = `Plugin ${manifest.name} frontend failed to load.`;
        }
        if (failure) {
          const installed = usePluginState.getState().plugins.find((plugin) => plugin.name === manifest.name);
          if (installed) pluginStore.uninstall(installed.plugin.getPluginName());
          removePlugin(manifest.name);
          loadedManifests.current.delete(manifest.name);
          if (!warnedFailures.current.has(key)) {
            warnedFailures.current.add(key);
            toastRef.current.warning({ title: `Plugin "${manifest.name}" is disabled`, description: failure });
          }
        }
        outcomes.set(manifest.name, !failure);
        return !failure;
      };
      for (const manifest of pluginsArray) await loadManifest(manifest);
    } catch (error) {
      console.error('Attraccess Plugin System: Failed to fetch plugins', error);
    } finally {
      arePluginsLoaded.current = true;
      loadingPlugins.current = false;
      console.debug('Attraccess Plugin System: All plugins loaded');
    }
  }, [loadPlugin, refetchPlugins, removePlugin]);

  useEffect(() => {
    console.debug('Attraccess Plugin System: Refetching plugins');
    void loadAllPlugins();
    // A server restart can recover a quarantined plugin while this tab stays mounted.
    // Recheck when the user returns, without reinstalling plugins already loaded here.
    const onFocus = () => {
      if (arePluginsLoaded.current) void loadAllPlugins();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadAllPlugins]);

  return <PluginProviderBase pluginStore={pluginStore}>{props.children}</PluginProviderBase>;
}
