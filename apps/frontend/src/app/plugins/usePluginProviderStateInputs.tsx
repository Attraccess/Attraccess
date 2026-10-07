import { usePluginsServiceGetPlugins } from '@attraccess/react-query-client';
import { PropsWithChildren, useEffect, useRef } from 'react';
import { RendererPlugin } from 'react-pluggable';
import usePluginState from './plugin.state';
import { setApiBaseUrl } from '@attraccess/plugins-frontend-sdk';
import { ToastType, useToastMessage } from '../../components/toastProvider';
import { useAuth } from '../../hooks/useAuth';
import { getBaseUrl } from '../../api';
import { pluginStore } from './plugin-provider.plugin-store';

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
