import { RendererPlugin } from 'react-pluggable';
import { useEffect, useRef } from 'react';
import { setApiBaseUrl } from '@attraccess/plugins-frontend-sdk';
import { getBaseUrl } from '../../api/index';
import { ToastType, useToastMessage } from '../../components/toastProvider';
import { pluginStore } from './pluginStore';

/** Installs the renderer plugin and the `notificationToast` function into the plugin store while mounted. */
export function usePluginRuntimeBootstrap() {
  const toast = useToastMessage();
  const toastRef = useRef(toast);
  toastRef.current = toast;

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
}
