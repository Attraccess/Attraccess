import { useMemo } from 'react';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import usePluginState from '../plugins/plugin.state';
// Not lazy: the strength preview is evaluated server-side, so this section pulls in nothing the
// main bundle does not already carry — and a Suspense boundary here only buys a spinner.
import { getRoutesOfPlugin } from './index.get-routes-of-plugin';
import { publicRoutes } from './publicRoutes';
import { resourceRoutes } from './resourceRoutes';
import { integrationRoutes } from './integrationRoutes';
import { billingRoutes } from './billingRoutes';
import { settingsCommunicationRoutes } from './settingsCommunicationRoutes';
import { settingsAccessRoutes } from './settingsAccessRoutes';
import { workspaceRoutes } from './workspaceRoutes';

// GrapesJS is heavy — keep the visual template editor out of the main bundle
// three.js + the OpenSCAD loader are large; keep them out of the main bundle.
const coreRoutes: RouteConfig[] = [
  ...publicRoutes,
  ...resourceRoutes,
  ...integrationRoutes,
  ...billingRoutes,
  ...settingsCommunicationRoutes,
  ...settingsAccessRoutes,
  ...workspaceRoutes,
];

export function useAllRoutes() {
  const { plugins: pluginManifests } = usePluginState();

  const pluginRoutes = useMemo(
    () => pluginManifests.flatMap((pluginManifest) => getRoutesOfPlugin(pluginManifest)),
    [pluginManifests],
  );

  return useMemo(() => [...coreRoutes, ...pluginRoutes], [pluginRoutes]);
}
