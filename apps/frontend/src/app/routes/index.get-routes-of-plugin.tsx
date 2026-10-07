import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { PluginRouteBoundary } from '../../components/pluginRouteBoundary';
import { PluginManifestWithPlugin } from '../plugins/plugin.state';

export function getRoutesOfPlugin(pluginManifest: PluginManifestWithPlugin): RouteConfig[] {
  const plugin = pluginManifest.plugin;
  const pluginName = plugin.getPluginName();

  let routes: RouteConfig[] | undefined;
  try {
    routes = plugin.getRoutes?.();
  } catch (error) {
    console.error(`Attraccess Plugin System: getRoutes() of plugin "${pluginName}" threw`, error);
    return [];
  }

  if (!routes) {
    return [];
  }

  if (!Array.isArray(routes)) {
    console.error(`Attraccess Plugin System: getRoutes() of plugin "${pluginName}" did not return an array`);
    return [];
  }

  // Wrap each plugin route element so a throwing render can't crash the app shell.
  return routes.map((route) => ({
    ...route,
    element: <PluginRouteBoundary pluginName={pluginName}>{route.element}</PluginRouteBoundary>,
  }));
}
