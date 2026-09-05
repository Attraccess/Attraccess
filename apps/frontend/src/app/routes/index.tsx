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
import { SSOProviderFormPage } from '../sso/providers/SSOProviderFormPage';
import { UserManagementPage } from '../user-management';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { PluginRouteBoundary } from '../../components/pluginRouteBoundary';
import usePluginState, { PluginManifestWithPlugin } from '../plugins/plugin.state';
import { AttractapList } from '../attractap/AttractapList';
import { AttractapDiagnosticsPage } from '../attractap/AttractapDiagnosticsPage';
import { NfcCardList } from '../attractap/NfcCardList';
import { CsvExport } from '../csv-export';
import { DocumentationEditor, DocumentationView } from '../resources/documentation';
import { EmailTemplatesPage } from '../email-templates/EmailTemplatesPage';
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
import { SettingsLayout } from '../settings/layout/SettingsLayout';
import { SettingsIndexPage } from '../settings/layout/SettingsIndexPage';
import { SETTINGS_SECTION_PERMISSIONS } from '../settings/layout/settingsSections';
import { GeneralSection } from '../settings/sections/general';
import { MonitoringSection } from '../settings/sections/monitoring';
import { AboutSection } from '../settings/sections/about';
import { RolesSection } from '../settings/sections/roles';
import { SsoSection } from '../settings/sections/sso';
import { EmailSection } from '../settings/sections/email';
import { MessagingSection } from '../settings/sections/messaging';
import { PluginsSection } from '../settings/sections/plugins';
// Not lazy: the strength preview is evaluated server-side, so this section pulls in nothing the
// main bundle does not already carry — and a Suspense boundary here only buys a spinner.
import { SecuritySection } from '../settings/sections/security';
import FirstTimeSetupPage from '../first-time-setup';
import { UnauthorizedLayout } from '../unauthorized/unauthorized-layout/layout';

const CompanionSettingsPage = lazy(() => import('../settings/companion'));
const EmailLayoutPage = lazy(() => import('../email-layout/EmailLayoutPage'));
// GrapesJS is heavy — keep the visual template editor out of the main bundle
const EditEmailTemplatePage = lazy(() => import('../email-templates/edit'));
// three.js + the OpenSCAD loader are large; keep them out of the main bundle.
const PrintablesPage = lazy(() => import('../printables'));

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
    authRequired: ['billing.manage', 'resources.reports.export'],
  },
  {
    path: '/billing/administration/sumup',
    element: <SumUpPage />,
    authRequired: 'billing.manage',
  },
  // Settings shell (ATT-864). Section routes are flat and wrap their own layout, as RouteConfig
  // has no nested-route form; the registry in settings/layout/settingsSections.ts is what keeps
  // these paths and the rail in agreement.
  // Any one of the section permissions gets in: the shell is the only route to SSO and Plugins now,
  // so gating it on `system.settings.manage` alone would lock out the operators those sections
  // exist for. The index page then redirects to the first section they may actually open.
  {
    path: '/settings',
    element: <SettingsIndexPage />,
    authRequired: SETTINGS_SECTION_PERMISSIONS,
  },
  {
    path: '/settings/general',
    element: (
      <SettingsLayout>
        <GeneralSection />
      </SettingsLayout>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/settings/monitoring',
    element: (
      <SettingsLayout>
        <MonitoringSection />
      </SettingsLayout>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/settings/email',
    element: (
      <SettingsLayout>
        <EmailSection />
      </SettingsLayout>
    ),
    authRequired: 'system.settings.manage',
  },
  // Templates and the shared layout are sub-routes of Email rather than sections of their own: both
  // are full-screen editors, and neither is redesigned here. The rail keeps Email highlighted while
  // one is open.
  {
    path: '/settings/email/templates',
    element: (
      <SettingsLayout>
        <EmailTemplatesPage />
      </SettingsLayout>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/settings/email/templates/:type',
    element: (
      <SettingsLayout>
        <Suspense fallback={<div className="flex items-center justify-center p-8"><Spinner size="sm" /></div>}>
          <EditEmailTemplatePage />
        </Suspense>
      </SettingsLayout>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/settings/email/layout',
    element: (
      <SettingsLayout>
        <Suspense fallback={<div className="flex items-center justify-center p-8"><Spinner size="sm" /></div>}>
          <EmailLayoutPage />
        </Suspense>
      </SettingsLayout>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/settings/messaging',
    element: (
      <SettingsLayout>
        <MessagingSection />
      </SettingsLayout>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/settings/about',
    element: (
      <SettingsLayout>
        <AboutSection />
      </SettingsLayout>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/settings/security',
    element: (
      <SettingsLayout>
        <SecuritySection />
      </SettingsLayout>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/settings/roles',
    element: (
      <SettingsLayout>
        <RolesSection />
      </SettingsLayout>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/settings/sso',
    element: (
      <SettingsLayout>
        <SsoSection />
      </SettingsLayout>
    ),
    authRequired: 'system.sso.manage',
  },
  // The provider form is a sub-route of the section rather than a section of its own — same shape as
  // the email editors above. Without these the in-shell targets `useSsoProvidersBasePath` produces
  // have nowhere to resolve.
  {
    path: '/settings/sso/providers/new',
    element: (
      <SettingsLayout>
        <SSOProviderFormPage />
      </SettingsLayout>
    ),
    authRequired: 'system.sso.manage',
  },
  {
    path: '/settings/sso/providers/:providerId',
    element: (
      <SettingsLayout>
        <SSOProviderFormPage />
      </SettingsLayout>
    ),
    authRequired: 'system.sso.manage',
  },
  {
    path: '/settings/plugins',
    element: (
      <SettingsLayout>
        <PluginsSection />
      </SettingsLayout>
    ),
    authRequired: 'system.plugins.manage',
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
  {
    path: '/messages',
    element: <MessagesPage />,
    authRequired: true,
  },
  {
    path: '/printables',
    element: (
      <Suspense fallback={<div className="flex items-center justify-center p-8"><Spinner size="sm" /></div>}>
        <PrintablesPage />
      </Suspense>
    ),
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
