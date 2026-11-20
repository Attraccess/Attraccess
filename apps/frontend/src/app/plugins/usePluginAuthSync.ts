import { useEffect } from 'react';
import { AttraccessFrontendPluginAuthData } from '@attraccess/plugins-frontend-sdk';
import { getBaseUrl } from '../../api/index';
import { useAuth } from '../../hooks/useAuth';
import usePluginState from './plugin.state';

/** Tells every loaded plugin the API endpoint and the signed-in user whenever either the plugin set or the user changes. */
export function usePluginAuthSync() {
  const plugins = usePluginState((s) => s.plugins);
  const { user } = useAuth();

  useEffect(() => {
    plugins.forEach((plugin) => {
      plugin.plugin.onApiEndpointChange(getBaseUrl());
      plugin.plugin.onApiAuthStateChange({
        authToken: '', // No longer using tokens - authentication is handled by cookies
        user: user as unknown as AttraccessFrontendPluginAuthData['user'],
        effectivePermissions: user?.effectivePermissions ?? [],
      });
    });
  }, [plugins, user]);
}
