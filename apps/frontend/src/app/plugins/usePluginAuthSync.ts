import { useEffect } from 'react';
import { getBaseUrl } from '../../api/index';
import { useAuth } from '../../hooks/useAuth';
import usePluginState from './plugin.state';
import { toPluginAuthUser } from './toPluginAuthUser';

/** Tells every loaded plugin the API endpoint and the signed-in user whenever either the plugin set or the user changes. */
export function usePluginAuthSync() {
  const plugins = usePluginState((s) => s.plugins);
  const { user } = useAuth();

  useEffect(() => {
    const pluginUser = toPluginAuthUser(user);
    plugins.forEach((plugin) => {
      plugin.plugin.onApiEndpointChange(getBaseUrl());
      plugin.plugin.onApiAuthStateChange({
        authToken: '', // No longer using tokens - authentication is handled by cookies
        user: pluginUser,
        effectivePermissions: user?.effectivePermissions ?? [],
      });
    });
  }, [plugins, user]);
}
