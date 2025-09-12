import { Navigate } from 'react-router-dom';
import { ResourceDetails } from '../resources/details/resourceDetails';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MqttServersPage, CreateMqttServerPage, EditMqttServerPage } from '../mqtt';
import { SSOProvidersPage } from '../sso/SSOProvidersPage';
import { UserManagementPage } from '../user-management';
import { usePluginStore } from 'react-pluggable';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { PluginsList } from '../plugins/PluginsList';
import usePluginState, { PluginManifestWithPlugin } from '../plugins/plugin.state';
import { AttractapList } from '../attractap/AttractapList';
import { NfcCardList } from '../attractap/NfcCardList';
import { CsvExport } from '../csv-export/csv-export';
import { DocumentationEditor, DocumentationView } from '../resources/documentation';
import { EmailTemplatesPage } from '../email-templates/EmailTemplatesPage';
import { EditEmailTemplatePage } from '../email-templates/edit';
import { ResourceGroupEditPage } from '../resource-groups';
import { ResourceOverview } from '../resourceOverview';
import { Dependencies } from '../dependencies';
import { UserManagementDetailsPage } from '../user-management/details';
import FlowsPage from '../resources/details/flows';
import AccountPage from '../account';
import ChangelogPage from '../changelog/ChangelogPage';
import { BillingDashboardPage } from '../billing/dashboard';
import { BillingAdministrationPage } from '../billing/administration';

const coreRoutes: RouteConfig[] = [
  {
    path: '/',
    element: <Navigate to="/resources" replace />,
    authRequired: true,
  },
  {
    path: '/changelog',
    element: <ChangelogPage />,
    authRequired: false,
  },
  {
    path: '/dependencies',
    element: <Dependencies />,
    authRequired: false,
  },
  {
    path: '/resources',
    element: <ResourceOverview />,
    authRequired: true,
  },
  {
    path: '/resources/:id',
    element: <ResourceDetails />,
    authRequired: true,
  },
  {
    path: '/resources/:id/flows',
    element: <FlowsPage />,
    authRequired: true,
  },
  {
    path: '/resources/:id/documentation',
    element: <DocumentationView />,
    authRequired: true,
  },
  {
    path: '/resources/:id/documentation/edit',
    element: <DocumentationEditor />,
    authRequired: 'canManageResources',
  },
  {
    path: '/resource-groups/:groupId',
    element: <ResourceGroupEditPage />,
    authRequired: true,
  },
  {
    path: '/mqtt/servers',
    element: <MqttServersPage />,
    authRequired: 'canManageResources',
  },
  {
    path: '/mqtt/servers/create',
    element: <CreateMqttServerPage />,
    authRequired: 'canManageResources',
  },
  {
    path: '/mqtt/servers/:serverId',
    element: <EditMqttServerPage />,
    authRequired: 'canManageResources',
  },
  {
    path: '/sso/providers',
    element: <SSOProvidersPage />,
    authRequired: 'canManageSystemConfiguration',
  },
  {
    path: '/users',
    element: <UserManagementPage />,
    authRequired: 'canManageUsers',
  },
  {
    path: '/users/:id',
    element: <UserManagementDetailsPage />,
    authRequired: 'canManageUsers',
  },
  {
    path: '/nfc-cards',
    element: <NfcCardList />,
    authRequired: true,
  },
  {
    path: '/attractap',
    element: <AttractapList />,
    authRequired: 'canManageSystemConfiguration',
  },
  {
    path: '/billing',
    element: <BillingDashboardPage />,
    authRequired: true,
  },
  {
    path: '/billing/administration',
    element: <BillingAdministrationPage />,
    authRequired: 'canManageBilling',
  },
  {
    path: '/billing/csv-export',
    element: <CsvExport />,
    authRequired: 'canManageBilling',
  },
  {
    path: '/plugins',
    element: <PluginsList />,
    authRequired: 'canManageSystemConfiguration',
  },
  {
    path: '/account',
    element: <AccountPage />,
    authRequired: true,
  },
  {
    path: '/email-templates',
    element: <EmailTemplatesPage />,
    authRequired: 'canManageSystemConfiguration',
  },
  {
    path: '/email-templates/:type',
    element: <EditEmailTemplatePage />,
    authRequired: 'canManageSystemConfiguration',
  },
];

export function useAllRoutes() {
  const { plugins: pluginManifests } = usePluginState();
  const pluginStore = usePluginStore();

  const [pluginRoutes, setPluginRoutes] = useState<RouteConfig[]>([]);

  const getRoutesOfPlugin = useCallback(
    (pluginManifest: PluginManifestWithPlugin) => {
      const pluginRoutes = pluginStore.executeFunction(
        `${pluginManifest.plugin.getPluginName()}.GET_ROUTES`,
        pluginManifest,
      );

      return pluginRoutes;
    },
    [pluginStore],
  );

  useEffect(() => {
    const routesOfAllPlugins = pluginManifests.map((pluginManifest) => getRoutesOfPlugin(pluginManifest)).flat();
    setPluginRoutes(routesOfAllPlugins);
  }, [pluginManifests, getRoutesOfPlugin]);

  return useMemo(() => [...coreRoutes, ...pluginRoutes], [pluginRoutes]);
}
