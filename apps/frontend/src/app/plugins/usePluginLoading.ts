import { useCallback, useEffect, useRef } from 'react';
import { LoadedPluginManifest, useGetPlugins } from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';
import { loadFrontendPlugin } from './loadFrontendPlugin';
import usePluginState from './plugin.state';
import { pluginStore } from './pluginStore';

/**
 * Fetches the plugin manifests, loads each plugin's frontend in dependency order, quarantines failures with a toast,
 * and rechecks whenever the tab regains focus.
 */
export function usePluginLoading() {
  const { refetch: refetchPlugins } = useGetPlugins();
  const toast = useToastMessage();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const arePluginsLoaded = useRef(false);
  const loadingPlugins = useRef(false);
  const loadedManifests = useRef(new Map<string, string>());
  const warnedFailures = useRef(new Set<string>());

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
        let failure: string | null =
          manifest.status === 'error' || manifest.status === 'license_missing'
            ? (manifest.error ?? 'Plugin failed to load')
            : null;
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
            if (await loadFrontendPlugin(manifest)) {
              loadedManifests.current.set(manifest.name, manifest.version);
              warnedFailures.current.delete(key);
            } else failure = `Plugin ${manifest.name} frontend failed to load.`;
          }
          if (failure) {
            const { plugins: installedPlugins, removePlugin } = usePluginState.getState();
            const installed = installedPlugins.find((plugin) => plugin.name === manifest.name);
            if (installed) pluginStore.uninstall(installed.plugin.getPluginName());
            removePlugin(manifest.name);
            loadedManifests.current.delete(manifest.name);
            // A missing license is an expected state, shown in Settings > Plugins: no toast.
            if (manifest.status !== 'license_missing' && !warnedFailures.current.has(key)) {
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
      usePluginState.getState().setInitialized(true);
      console.debug('Attraccess Plugin System: All plugins loaded');
    }
  }, [refetchPlugins]);

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
}
