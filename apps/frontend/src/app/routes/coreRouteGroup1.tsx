import { ResourceTabsLayout } from '../resources/details/layout/ResourceTabsLayout';
import { ResourceOverviewTab } from '../resources/details/overview/ResourceOverviewTab';
import { ResourceHistoryTab } from '../resources/details/history/ResourceHistoryTab';
import { ResourcePeopleTab } from '../resources/details/people/ResourcePeopleTab';
import { ResourceGroupsTab } from '../resources/details/groups/ResourceGroupsTab';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import FlowsPage from '../resources/details/flows';
import { FormEditorPage, FormListPage } from '../resources/details/forms';
import { ResourceSettingsPage } from '../resources/settings/ResourceSettingsPage';
import { ResourceSettingsSection } from '../resources/settings/ResourceSettingsSection';
export const coreRouteGroup1: RouteConfig[] = [
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
];
