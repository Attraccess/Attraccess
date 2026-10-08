import { PropsWithChildren, useCallback, useEffect, useRef } from 'react';
import { PluginProvider as PluginProviderBase, RendererPlugin, createPluginStore } from 'react-pluggable';
import { LoadedPluginManifest, usePluginsServiceGetPlugins } from '@attraccess/react-query-client';
import usePluginState from './plugin.state';
// The federation runtime is injected by Vite.
// @ts-expect-error -- Vite supplies the virtual federation module at build time.
import { __federation_method_getRemote, __federation_method_setRemote } from 'virtual:__federation__';
import {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  setApiBaseUrl,
} from '@attraccess/plugins-frontend-sdk';
import { getBaseUrl } from '../../api/index';
import { ToastType, useToastMessage } from '../../components/toastProvider';
import { useAuth } from '../../hooks/useAuth';

export const pluginStore = createPluginStore();

export function usePluginProviderStateInputs(props: PropsWithChildren) {
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
  return {
    refetchPlugins,
    addPlugin,
    removePlugin,
    isInstalled,
    plugins,
    toast,
    user,
    toastRef,
    arePluginsLoaded,
    loadingPlugins,
    loadedManifests,
    warnedFailures,
    props,
  } as const;
}

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

export function usePluginProviderStateOutput(model: ReturnType<typeof usePluginProviderStateLoadPlugin>) {
  const {
    loadingPlugins,
    refetchPlugins,
    warnedFailures,
    toastRef,
    loadedManifests,
    loadPlugin,
    removePlugin,
    arePluginsLoaded,
  } = model;
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
      const byName = new Map(pluginsArray.map((manifest) => [manifest.name, manifest]));
      const dependencyFailures = new Map<string, string | null>();
      const dependencyFailure = (manifest: LoadedPluginManifest, path: string[] = []): string | null => {
        if (path.includes(manifest.name)) return `Plugin dependency cycle: ${[...path, manifest.name].join(' → ')}`;
        if (dependencyFailures.has(manifest.name)) return dependencyFailures.get(manifest.name);
        let failure: string | null = manifest.status === 'error' ? (manifest.error ?? 'Plugin failed to load') : null;
        if (!failure) {
          for (const dependency of manifest.dependencies ?? []) {
            if (!dependency.required) continue;
            const required = byName.get(dependency.name);
            if (!required || dependencyFailure(required, [...path, manifest.name])) {
              failure = `Required plugin ${dependency.name} failed to load; ${manifest.name} is inactive.`;
              break;
            }
          }
        }
        dependencyFailures.set(manifest.name, failure);
        return failure;
      };
      const loads = new Map<string, Promise<boolean>>();
      const loadManifest = (manifest: LoadedPluginManifest): Promise<boolean> => {
        const existing = loads.get(manifest.name);
        if (existing) return existing;
        // Cache before descending, and check the graph synchronously so
        // concurrently started roots cannot wait on each other in a cycle.
        const loading = Promise.resolve().then(async () => {
          let failure = dependencyFailure(manifest);
          if (!failure) {
            const required = (manifest.dependencies ?? []).filter((dependency) => dependency.required);
            const outcomes = await Promise.all(required.map((dependency) => loadManifest(byName.get(dependency.name))));
            const failedIndex = outcomes.findIndex((loaded) => !loaded);
            if (failedIndex >= 0)
              failure = `Required plugin ${required[failedIndex].name} failed to load; ${manifest.name} is inactive.`;
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
          return !failure;
        });
        loads.set(manifest.name, loading);
        return loading;
      };
      await Promise.all(pluginsArray.map((manifest) => loadManifest(manifest)));
    } catch (error) {
      console.error('Attraccess Plugin System: Failed to fetch plugins', error);
    } finally {
      arePluginsLoaded.current = true;
      loadingPlugins.current = false;
      console.debug('Attraccess Plugin System: All plugins loaded');
    }
  }, [
    loadPlugin,
    refetchPlugins,
    removePlugin,
    loadingPlugins,
    warnedFailures,
    toastRef,
    loadedManifests,
    arePluginsLoaded,
  ]);

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
  }, [loadAllPlugins, arePluginsLoaded]);
  return { props: model.props };
}

export function usePluginProviderState(props: PropsWithChildren) {
  const usePluginProviderStateInputsModel = usePluginProviderStateInputs(props);
  const usePluginProviderStateLoadPluginModel = usePluginProviderStateLoadPlugin(usePluginProviderStateInputsModel);
  return usePluginProviderStateOutput(usePluginProviderStateLoadPluginModel);
}

export function PluginProvider(props: PropsWithChildren) {
  usePluginProviderState(props);

  return <PluginProviderBase pluginStore={pluginStore}>{props.children}</PluginProviderBase>;
}
