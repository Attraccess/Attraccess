import { Navigate } from 'react-router-dom';
import { ResourceTabsLayout } from '../resources/details/layout/ResourceTabsLayout';
import { ResourceOverviewTab } from '../resources/details/overview/ResourceOverviewTab';
import { ResourceHistoryTab } from '../resources/details/history/ResourceHistoryTab';
import { ResourcePeopleTab } from '../resources/details/people/ResourcePeopleTab';
import { ResourceGroupsTab } from '../resources/details/groups/ResourceGroupsTab';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Spinner } from '@heroui/react';
import { MqttServersPage, EditMqttServerPage } from '../mqtt';
import { SSOProvidersPage } from '../sso/SSOProvidersPage';
import { UserManagementPage } from '../user-management';
import { usePluginStore } from 'react-pluggable';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { PluginsList } from '../plugins/PluginsList';
import usePluginState, { PluginManifestWithPlugin } from '../plugins/plugin.state';
import { AttractapList } from '../attractap/AttractapList';
import { NfcCardList } from '../attractap/NfcCardList';
import { CsvExport } from '../csv-export';
import { DocumentationEditor, DocumentationView } from '../resources/documentation';
import { EmailTemplatesPage } from '../email-templates/EmailTemplatesPage';
import { EditEmailTemplatePage } from '../email-templates/edit';
import { ResourceGroupEditPage } from '../resource-groups';
import { ResourceOverview } from '../resourceOverview';
import { Dependencies } from '../dependencies';
import { UserManagementDetailsPage } from '../user-management/details';
import FlowsPage from '../resources/details/flows';
import { MaintenanceHubPage } from '../resources/details/maintenance-hub';
import { FormEditorPage, FormListPage } from '../resources/details/forms';
import AccountPage from '../account';
import { ConfirmDeleteAccount } from '../confirm-delete-account';
import ChangelogPage from '../changelog/ChangelogPage';
import { BillingDashboardPage } from '../billing/dashboard';
import { BillingAdministrationPage } from '../billing/administration';
import { SumUpPage } from '../billing/administration/sumup';
import { BalenaPage } from '../balena';
import { ProjectsListPage } from '../projects';
import { ProjectDetailsPage } from '../projects/details';
import { ProjectTeamPage } from '../projects/details/team';
import SystemSettingsPage from '../settings';
import FirstTimeSetupPage from '../first-time-setup';
import { UnauthorizedLayout } from '../unauthorized/unauthorized-layout/layout';

const PasswordPolicySettingsPage = lazy(() => import('../settings/password-policy'));

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
    path: '/first-time-setup',
    element: (
      <UnauthorizedLayout>
        <FirstTimeSetupPage />
      </UnauthorizedLayout>
    ),
    authRequired: false,
  },
  {
    path: '/confirm-delete-account',
    element: <ConfirmDeleteAccount />,
    authRequired: false,
  },
  {
    path: '/resources',
    element: <ResourceOverview />,
    authRequired: true,
  },
  {
    path: '/resources/:id',
    element: (
      <ResourceTabsLayout>
        <ResourceOverviewTab />
      </ResourceTabsLayout>
    ),
    authRequired: true,
  },
  {
    path: '/resources/:id/history',
    element: (
      <ResourceTabsLayout>
        <ResourceHistoryTab />
      </ResourceTabsLayout>
    ),
    authRequired: true,
  },
  {
    path: '/resources/:id/people',
    element: (
      <ResourceTabsLayout>
        <ResourcePeopleTab />
      </ResourceTabsLayout>
    ),
    authRequired: true,
  },
  {
    path: '/resources/:id/groups',
    element: (
      <ResourceTabsLayout>
        <ResourceGroupsTab />
      </ResourceTabsLayout>
    ),
    authRequired: 'canManageResources',
  },
  {
    path: '/resources/:id/flows',
    element: (
      <ResourceTabsLayout>
        <FlowsPage />
      </ResourceTabsLayout>
    ),
    authRequired: true,
  },
  {
    path: '/resources/:id/forms',
    element: (
      <ResourceTabsLayout>
        <FormListPage />
      </ResourceTabsLayout>
    ),
    authRequired: 'canManageResources',
  },
  {
    path: '/resources/:id/forms/:formId',
    element: (
      <ResourceTabsLayout>
        <FormEditorPage />
      </ResourceTabsLayout>
    ),
    authRequired: 'canManageResources',
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
    path: '/resources/:id/maintenance',
    element: (
      <ResourceTabsLayout>
        <MaintenanceHubPage />
      </ResourceTabsLayout>
    ),
    authRequired: true,
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
    path: '/balena',
    element: <BalenaPage />,
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
    path: '/attractap',
    element: <Navigate to="/attractap/nfc-cards" replace />,
    authRequired: true,
  },
  {
    path: '/attractap/nfc-cards',
    element: <NfcCardList />,
    authRequired: true,
  },
  {
    path: '/attractap/readers',
    element: <AttractapList />,
    authRequired: 'canManageResources',
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
    path: '/csv-export',
    element: <CsvExport />,
    authRequired: 'canManageBilling',
  },
  {
    path: '/billing/administration/sumup',
    element: <SumUpPage />,
    authRequired: 'canManageBilling',
  },
  {
    path: '/plugins',
    element: <PluginsList />,
    authRequired: 'canManageSystemConfiguration',
  },
  {
    path: '/settings',
    element: <SystemSettingsPage />,
    authRequired: 'canManageSystemConfiguration',
  },
  {
    path: '/settings/security/password-policy',
    element: (
      <Suspense fallback={<div className="flex items-center justify-center p-8"><Spinner size="sm" /></div>}>
        <PasswordPolicySettingsPage />
      </Suspense>
    ),
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
  {
    path: '/projects',
    element: <ProjectsListPage />,
    authRequired: true,
  },
  {
    path: '/projects/:id',
    element: <ProjectDetailsPage />,
    authRequired: true,
  },
  {
    path: '/projects/:id/team',
    element: <ProjectTeamPage />,
    authRequired: true,
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
