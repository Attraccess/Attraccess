import { PluginLiveUpdatesIdentityProvider, RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { Spinner } from '@heroui/react';
import { Suspense, lazy, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { PluginRouteBoundary } from '../../components/pluginRouteBoundary';
import AccountPage from '../account/index';
import { AttractapDiagnosticsPage } from '../attractap/AttractapDiagnosticsPage/index';
import { AttractapList } from '../attractap/AttractapList/index';
import { RfidCardList, UserRfidCardsPage } from '../attractap/RfidCardList/index';
import { BalenaPage } from '../balena/index';
import { BillingAdministrationPage } from '../billing/administration/index';
import { SumUpPage } from '../billing/administration/sumup/index';
import { BillingDashboardPage } from '../billing/dashboard/index';
import ChangelogPage from '../changelog/ChangelogPage';
import { ConfirmDeleteAccount } from '../confirm-delete-account/index';
import { CsvExport } from '../csv-export/index';
import { Dependencies } from '../dependencies/index';
import { EmailTemplatesPage } from '../email-templates/EmailTemplatesPage';
import FirstTimeSetupPage from '../first-time-setup/index';
import { KioskCompanionPage } from '../kiosk/companion/KioskCompanionPage';
import { KioskLayout } from '../kiosk/layout/KioskLayout';
import { KioskResourcePage } from '../kiosk/resources/KioskResourcePage';
import { MessagesPage } from '../messaging/index';
import { EditMqttServerPage, MqttServersPage } from '../mqtt/index';
import usePluginState, { PluginManifestWithPlugin } from '../plugins/plugin.state';
import { ProjectDetailsPage } from '../projects/details/index';
import { ProjectTeamPage } from '../projects/details/team/index';
import { ProjectsListPage } from '../projects/index';
import { ResourceGroupEditPage } from '../resource-groups/index';
import { ResourceOverview } from '../resourceOverview/index';
import { ResourceDiagnosticsTab } from '../resources/details/diagnostics/ResourceDiagnosticsTab';
import FlowsPage from '../resources/details/flows/index';
import { FormEditorPage, FormListPage } from '../resources/details/forms/index';
import { ResourceGroupsTab } from '../resources/details/groups/ResourceGroupsTab';
import { ResourceHistoryTab } from '../resources/details/history/ResourceHistoryTab';
import { ResourceTabsLayout } from '../resources/details/layout/ResourceTabsLayout';
import { MaintenanceHubPage } from '../resources/details/maintenance-hub/index';
import { ResourceOverviewTab } from '../resources/details/overview/ResourceOverviewTab';
import { ResourcePeopleTab } from '../resources/details/people/ResourcePeopleTab';
import { DocumentationEditor, DocumentationView } from '../resources/documentation/index';
import { ResourceSettingsPage } from '../resources/settings/ResourceSettingsPage';
import { ResourceSettingsSection } from '../resources/settings/ResourceSettingsSection';
import { SettingsIndexPage } from '../settings/layout/SettingsIndexPage';
import { SettingsLayout } from '../settings/layout/SettingsLayout';
import { SETTINGS_SECTION_PERMISSIONS } from '../settings/layout/settingsSections';
import { AboutSection } from '../settings/sections/about/index';
import { AuditLogSection } from '../settings/sections/audit-log/index';
import { EmailSection } from '../settings/sections/email/index';
import { GeneralSection } from '../settings/sections/general/index';
import { MessagingSection } from '../settings/sections/messaging/index';
import { MonitoringSection } from '../settings/sections/monitoring/index';
import { PluginsSection } from '../settings/sections/plugins/index';
import { RolesSection } from '../settings/sections/roles/index';
import { SecuritySection } from '../settings/sections/security/index';
import { SsoSection } from '../settings/sections/sso/index';
import { SSOProviderFormPage } from '../sso/providers/SSOProviderFormPage';
import { UnauthorizedLayout } from '../unauthorized/unauthorized-layout/layout';
import { UserManagementDetailsPage } from '../user-management/details/index';
import { UserManagementPage } from '../user-management/index';

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
    element: (
      <PluginRouteBoundary pluginName={pluginName}>
        <PluginLiveUpdatesIdentityProvider name={pluginManifest.name}>
          {route.element}
        </PluginLiveUpdatesIdentityProvider>
      </PluginRouteBoundary>
    ),
  }));
}

export const EmailLayoutPage = lazy(() => import('../email-layout/EmailLayoutPage'));

// GrapesJS is heavy — keep the visual template editor out of the main bundle
export const EditEmailTemplatePage = lazy(() => import('../email-templates/edit'));

export const CompanionSettingsPage = lazy(() => import('../settings/companion'));

// three.js + the OpenSCAD loader are large; keep them out of the main bundle.
export const PrintablesPage = lazy(() => import('../printables'));

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
    path: '/resources/:id/settings',
    element: <ResourceSettingsPage />,
    authRequired: 'resources.update',
  },
  {
    path: '/resources/:id/groups',
    element: (
      <ResourceSettingsSection topic="groups">
        <ResourceGroupsTab />
      </ResourceSettingsSection>
    ),
    authRequired: 'resources.update',
  },
  {
    path: '/resources/:id/flows',
    element: (
      <ResourceSettingsSection topic="flows">
        <FlowsPage />
      </ResourceSettingsSection>
    ),
    authRequired: 'resources.update',
  },
  {
    path: '/resources/:id/forms',
    element: (
      <ResourceSettingsSection topic="forms">
        <FormListPage />
      </ResourceSettingsSection>
    ),
    authRequired: 'resources.update',
  },
  {
    path: '/resources/:id/forms/:formId',
    element: <FormEditorPage />,
    authRequired: 'resources.update',
  },
  {
    path: '/resources/:id/diagnostics',
    element: (
      <ResourceSettingsSection topic="diagnostics">
        <ResourceDiagnosticsTab />
      </ResourceSettingsSection>
    ),
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
    path: '/users/:id/rfid-cards',
    element: <UserRfidCardsPage />,
    authRequired: 'users.rfid-cards.manage',
  },
  {
    path: '/attractap',
    element: <Navigate to="/attractap/nfc-cards" replace />,
    authRequired: true,
  },
  {
    path: '/attractap/nfc-cards',
    element: <RfidCardList />,
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
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-8">
            <Spinner size="sm" />
          </div>
        }
      >
        <EditEmailTemplatePage />
      </Suspense>
    ),
    authRequired: 'system.settings.manage',
  },
  {
    path: '/settings/email/layout',
    element: (
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-8">
            <Spinner size="sm" />
          </div>
        }
      >
        <EmailLayoutPage />
      </Suspense>
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
    path: '/settings/audit-log',
    element: (
      <SettingsLayout>
        <AuditLogSection />
      </SettingsLayout>
    ),
    authRequired: 'system.audit.read',
  },
  {
    path: '/devices/companion',
    element: (
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-8">
            <Spinner size="sm" />
          </div>
        }
      >
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
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-8">
            <Spinner size="sm" />
          </div>
        }
      >
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

export function useAllRoutes() {
  const { plugins: pluginManifests } = usePluginState();

  const pluginRoutes = useMemo(
    () => pluginManifests.flatMap((pluginManifest) => getRoutesOfPlugin(pluginManifest)),
    [pluginManifests],
  );

  return useMemo(() => [...coreRoutes, ...pluginRoutes], [pluginRoutes]);
}
