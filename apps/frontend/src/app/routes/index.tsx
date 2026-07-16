import { Navigate } from 'react-router-dom';
import { ResourceTabsLayout } from '../resources/details/layout/ResourceTabsLayout';
import { ResourceOverviewTab } from '../resources/details/overview/ResourceOverviewTab';
import { KioskLayout } from '../kiosk/layout/KioskLayout';
import { KioskResourcePage } from '../kiosk/resources/KioskResourcePage';
import { KioskCompanionPage } from '../kiosk/companion/KioskCompanionPage';
import { ResourceHistoryTab } from '../resources/details/history/ResourceHistoryTab';
import { ResourcePeopleTab } from '../resources/details/people/ResourcePeopleTab';
import { ResourceGroupsTab } from '../resources/details/groups/ResourceGroupsTab';
import { lazy, Suspense, useMemo } from 'react';
import { Spinner } from '@heroui/react';
import { MqttServersPage, EditMqttServerPage } from '../mqtt';
import { SSOProvidersPage } from '../sso/SSOProvidersPage';
import { SSOProviderFormPage } from '../sso/providers/SSOProviderFormPage';
import { UserManagementPage } from '../user-management';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { PluginRouteBoundary } from '../../components/pluginRouteBoundary';
import { PluginsList } from '../plugins/PluginsList';
import usePluginState, { PluginManifestWithPlugin } from '../plugins/plugin.state';
import { AttractapList } from '../attractap/AttractapList';
import { AttractapDiagnosticsPage } from '../attractap/AttractapDiagnosticsPage';
import { NfcCardList } from '../attractap/NfcCardList';
import { CsvExport } from '../csv-export';
import { DocumentationEditor, DocumentationView } from '../resources/documentation';
import { EmailTemplatesPage } from '../email-templates/EmailTemplatesPage';
import { EmailsPage } from '../emails/EmailsPage';
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
import { MessagesPage } from '../messaging';
import { ProjectDetailsPage } from '../projects/details';
import { ProjectTeamPage } from '../projects/details/team';
import SystemSettingsPage from '../settings';
import FirstTimeSetupPage from '../first-time-setup';
import { UnauthorizedLayout } from '../unauthorized/unauthorized-layout/layout';

const PasswordPolicySettingsPage = lazy(() => import('../settings/password-policy'));
const CompanionSettingsPage = lazy(() => import('../settings/companion'));
const EmailLayoutPage = lazy(() => import('../email-layout/EmailLayoutPage'));
// GrapesJS is heavy — keep the visual template editor out of the main bundle
const EditEmailTemplatePage = lazy(() => import('../email-templates/edit'));
const UserSecurityPage = lazy(() => import('../user-management/security'));
const MessagingSettingsPage = lazy(() => import('../messaging/settings'));
const MonitoringPage = lazy(() => import('../monitoring'));

const coreRoutes: RouteConfig[] = [
  {
    path: '/kiosk/resources/:id',
    element: (
      <KioskLayout>
        <KioskResourcePage />
      </KioskLayout>
    ),
    authRequired: false,
    noLayout: true,
  },
  {
    path: '/kiosk/companion',
    element: (
      <KioskLayout>
        <KioskCompanionPage />
      </KioskLayout>
    ),
    authRequired: false,
    noLayout: true,
  },
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
    authRequired: 'resources.update',
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
    authRequired: 'resources.update',
  },
  {
    path: '/resources/:id/forms/:formId',
    element: <FormEditorPage />,
    authRequired: 'resources.update',
  },
  {
    path: '/resources/:id/documentation',
    element: <DocumentationView />,
    authRequired: true,
  },
  {
    path: '/resources/:id/documentation/edit',
    element: <DocumentationEditor />,
    authRequired: 'resources.update',
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
    path: '/devices/mqtt/servers',
    element: <MqttServersPage />,
    authRequired: 'resources.update',
  },
  {
    path: '/devices/mqtt/servers/:serverId',
    element: <EditMqttServerPage />,
    authRequired: 'resources.update',
  },
  {
    path: '/sso/providers',
    element: <SSOProvidersPage />,
    authRequired: 'system.sso.manage',
  },
  {
    path: '/sso/providers/new',
    element: <SSOProviderFormPage />,
    authRequired: 'system.sso.manage',
  },
  {
    path: '/sso/providers/:providerId',
    element: <SSOProviderFormPage />,
    authRequired: 'system.sso.manage',
  },
  {
    path: '/balena',
    element: <BalenaPage />,
    authRequired: 'system.settings.manage',
  },
  {
    path: '/users',
    element: <UserManagementPage />,
    authRequired: 'users.read',
  },
  {
    path: '/users/:id',
    element: <UserManagementDetailsPage />,
    authRequired: 'users.read',
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
    authRequired: 'resources.update',
  },
  {
    path: '/attractap/readers/:readerId/diagnostics',
    element: <AttractapDiagnosticsPage />,
    authRequired: 'resources.update',
  },
  {
    path: '/billing',
    element: <BillingDashboardPage />,
    authRequired: true,
  },
  {
    path: '/billing/administration',
    element: <BillingAdministrationPage />,
    authRequired: 'billing.manage',
  },
  {
    path: '/csv-export',
    element: <CsvExport />,
    authRequired: 'billing.manage',
  },
  {
    path: '/billing/administration/sumup',
    element: <SumUpPage />,
    authRequired: 'billing.manage',
  },
  {
    path: '/plugins',
    element: <PluginsList />,
    authRequired: 'system.plugins.manage',
  },
  {
    path: '/settings',
    element: <SystemSettingsPage />,
    authRequired: 'system.settings.manage',
  },
  // User security section
  {
    path: '/users/security',
    element: (
      <Suspense fallback={<div className="flex items-center justify-center p-8"><Spinner size="sm" /></div>}>
        <UserSecurityPage />
      </Suspense>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/users/security/password-policy',
    element: (
      <Suspense fallback={<div className="flex items-center justify-center p-8"><Spinner size="sm" /></div>}>
        <PasswordPolicySettingsPage />
      </Suspense>
    ),
    authRequired: 'system.settings.manage',
  },
  // Messaging settings
  {
    path: '/messages/settings',
    element: (
      <Suspense fallback={<div className="flex items-center justify-center p-8"><Spinner size="sm" /></div>}>
        <MessagingSettingsPage />
      </Suspense>
    ),
    authRequired: 'system.settings.manage',
  },
  // Monitoring
  {
    path: '/monitoring',
    element: (
      <Suspense fallback={<div className="flex items-center justify-center p-8"><Spinner size="sm" /></div>}>
        <MonitoringPage />
      </Suspense>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/devices/companion',
    element: (
      <Suspense fallback={<div className="flex items-center justify-center p-8"><Spinner size="sm" /></div>}>
        <CompanionSettingsPage />
      </Suspense>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/account',
    element: <AccountPage />,
    authRequired: true,
  },
  // Emails section
  {
    path: '/emails',
    element: <EmailsPage />,
    authRequired: 'system.settings.manage',
  },
  {
    path: '/emails/templates',
    element: <EmailTemplatesPage />,
    authRequired: 'system.settings.manage',
  },
  {
    path: '/emails/templates/:type',
    element: (
      <Suspense fallback={<div className="flex items-center justify-center p-8"><Spinner size="sm" /></div>}>
        <EditEmailTemplatePage />
      </Suspense>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/emails/layout',
    element: (
      <Suspense fallback={<div className="flex items-center justify-center p-8"><Spinner size="sm" /></div>}>
        <EmailLayoutPage />
      </Suspense>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/messages',
    element: <MessagesPage />,
    authRequired: true,
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

function getRoutesOfPlugin(pluginManifest: PluginManifestWithPlugin): RouteConfig[] {
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

export function useAllRoutes() {
  const { plugins: pluginManifests } = usePluginState();

  const pluginRoutes = useMemo(
    () => pluginManifests.flatMap((pluginManifest) => getRoutesOfPlugin(pluginManifest)),
    [pluginManifests],
  );

  return useMemo(() => [...coreRoutes, ...pluginRoutes], [pluginRoutes]);
}
