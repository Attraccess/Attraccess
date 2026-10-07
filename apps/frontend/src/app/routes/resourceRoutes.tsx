import { ResourceTabsLayout } from '../resources/details/layout/ResourceTabsLayout';
import { ResourceOverviewTab } from '../resources/details/overview/ResourceOverviewTab';
import { ResourceHistoryTab } from '../resources/details/history/ResourceHistoryTab';
import { ResourcePeopleTab } from '../resources/details/people/ResourcePeopleTab';
import { ResourceGroupsTab } from '../resources/details/groups/ResourceGroupsTab';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { DocumentationEditor, DocumentationView } from '../resources/documentation';
import { ResourceGroupEditPage } from '../resource-groups';
import { ResourceOverview } from '../resourceOverview';
import FlowsPage from '../resources/details/flows';
import { MaintenanceHubPage } from '../resources/details/maintenance-hub';
import { FormEditorPage, FormListPage } from '../resources/details/forms';
import { ResourceDiagnosticsTab } from '../resources/details/diagnostics/ResourceDiagnosticsTab';
import { ResourceSettingsPage } from '../resources/settings/ResourceSettingsPage';
import { ResourceSettingsSection } from '../resources/settings/ResourceSettingsSection';
export const resourceRoutes: RouteConfig[] = [
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
];
