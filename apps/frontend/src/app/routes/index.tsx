import { useMemo } from 'react';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import usePluginState from '../plugins/plugin.state';
// Not lazy: the strength preview is evaluated server-side, so this section pulls in nothing the
// main bundle does not already carry — and a Suspense boundary here only buys a spinner.
import { getRoutesOfPlugin } from './index.get-routes-of-plugin';
import { coreRouteGroup0 } from './coreRouteGroup0';
import { coreRouteGroup1 } from './coreRouteGroup1';
import { coreRouteGroup2 } from './coreRouteGroup2';
import { coreRouteGroup3 } from './coreRouteGroup3';
import { coreRouteGroup4 } from './coreRouteGroup4';
import { coreRouteGroup5 } from './coreRouteGroup5';
import { coreRouteGroup6 } from './coreRouteGroup6';
import { coreRouteGroup7 } from './coreRouteGroup7';

// GrapesJS is heavy — keep the visual template editor out of the main bundle
// three.js + the OpenSCAD loader are large; keep them out of the main bundle.
const coreRoutes: RouteConfig[] = [
  ...coreRouteGroup0,
  ...coreRouteGroup1,
  ...coreRouteGroup2,
  ...coreRouteGroup3,
  ...coreRouteGroup4,
  ...coreRouteGroup5,
  ...coreRouteGroup6,
  ...coreRouteGroup7,
];

export function useAllRoutes() {
  const { plugins: pluginManifests } = usePluginState();

  const pluginRoutes = useMemo(
    () => pluginManifests.flatMap((pluginManifest) => getRoutesOfPlugin(pluginManifest)),
    [pluginManifests],
  );

  return useMemo(() => [...coreRoutes, ...pluginRoutes], [pluginRoutes]);
}
