import { useCallback, useEffect, useRef } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { LoadedPluginManifest, useGetPlugins } from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';
import { useAuth } from '../../hooks/useAuth';
import { loadFrontendPlugin } from './loadFrontendPlugin';
import { onePluginPerName } from './onePluginPerName';
import usePluginState from './plugin.state';
import { pluginStore } from './pluginStore';
import en from './usePluginLoading.en.json';
import de from './usePluginLoading.de.json';

/** Why a plugin is inactive: a key of usePluginLoading.*.json with its values. */
interface PluginFailure {
  key: 'refused' | 'failed' | 'frontendFailed' | 'dependencyFailed' | 'dependencyCycle';
  values?: Record<string, string>;
}

/** The failure the server reports for a plugin (refused, failed to load or missing a license), or null. */
function statusFailure(manifest: LoadedPluginManifest): PluginFailure | null {
  if (manifest.status === 'error') return { key: manifest.refused ? 'refused' : 'failed' };
  return manifest.status === 'license_missing' ? { key: 'failed' } : null;
}

/**
 * Fetches the plugin manifests, loads each plugin's frontend in dependency order, quarantines failures with a toast,
 * and rechecks whenever the tab regains focus. Only plugin managers see the toast: nobody else can act on it. The
 * plugin list usually arrives before the signed-in user does, so failures wait until the permission is known.
 */
export function usePluginLoading() {
  const { refetch: refetchPlugins } = useGetPlugins();
  const toast = useToastMessage();
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const canManagePlugins = hasPermission('system.plugins.manage');
  const warnedFailures = useRef(new Set<string>());
  const pendingFailures = useRef(new Map<string, { manifest: LoadedPluginManifest; failure: PluginFailure }>());
  const warnRef = useRef<(manifest: LoadedPluginManifest, failure: PluginFailure) => void>(() => undefined);
  warnRef.current = (manifest, failure) => {
    const key = `${manifest.name}@${manifest.version}`;
    if (warnedFailures.current.has(key)) return;
    if (!canManagePlugins) {
      pendingFailures.current.set(key, { manifest, failure });
      return;
    }
    pendingFailures.current.delete(key);
    warnedFailures.current.add(key);
    toast.warning({ title: t('disabledTitle', { name: manifest.name }), description: t(failure.key, failure.values) });
  };

  useEffect(() => {
    if (!canManagePlugins) return;
    for (const { manifest, failure } of [...pendingFailures.current.values()]) warnRef.current(manifest, failure);
  }, [canManagePlugins]);

  const arePluginsLoaded = useRef(false);
  const loadingPlugins = useRef(false);
  const loadedManifests = useRef(new Map<string, string>());

  const loadAllPlugins = useCallback(async () => {
    if (loadingPlugins.current) return;
    loadingPlugins.current = true;
    console.debug('Attraccess Plugin System: Loading all plugins');

    try {
      const plugins = await refetchPlugins();
      const pluginsArray = plugins.data ?? [];
      for (const plugin of pluginsArray.filter((manifest) => manifest.status === 'error')) {
        warnRef.current(plugin, statusFailure(plugin) ?? { key: 'failed' });
      }
      const candidates = onePluginPerName(pluginsArray);
      const byName = new Map(candidates.map((manifest) => [manifest.name, manifest]));
      const dependencyFailures = new Map<string, PluginFailure | null>();
      const missingDependency = (dependency: string, name: string): PluginFailure => ({
        key: 'dependencyFailed',
        values: { dependency, name },
      });
      const dependencyFailure = (manifest: LoadedPluginManifest, path: string[] = []): PluginFailure | null => {
        if (path.includes(manifest.name)) {
          return { key: 'dependencyCycle', values: { cycle: [...path, manifest.name].join(' → ') } };
        }
        if (dependencyFailures.has(manifest.name)) return dependencyFailures.get(manifest.name);
        let failure = statusFailure(manifest);
        if (!failure) {
          for (const dependency of manifest.dependencies ?? []) {
            if (!dependency.required) continue;
            const required = byName.get(dependency.name);
            if (!required || dependencyFailure(required, [...path, manifest.name])) {
              failure = missingDependency(dependency.name, manifest.name);
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
            if (failedIndex >= 0) failure = missingDependency(required[failedIndex].name, manifest.name);
          }
          const key = `${manifest.name}@${manifest.version}`;
          if (!failure && manifest.main.frontend && loadedManifests.current.get(manifest.name) !== manifest.version) {
            if (await loadFrontendPlugin(manifest)) {
              loadedManifests.current.set(manifest.name, manifest.version);
              warnedFailures.current.delete(key);
              pendingFailures.current.delete(key);
            } else failure = { key: 'frontendFailed' };
          }
          if (failure) {
            const { plugins: installedPlugins, removePlugin } = usePluginState.getState();
            const installed = installedPlugins.find((plugin) => plugin.name === manifest.name);
            if (installed) pluginStore.uninstall(installed.plugin.getPluginName());
            removePlugin(manifest.name);
            loadedManifests.current.delete(manifest.name);
            // A missing license is an expected state, shown in Settings > Plugins: no toast.
            if (manifest.status !== 'license_missing') warnRef.current(manifest, failure);
          }
          return !failure;
        });
        loads.set(manifest.name, loading);
        return loading;
      };
      await Promise.all(candidates.map((manifest) => loadManifest(manifest)));
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
