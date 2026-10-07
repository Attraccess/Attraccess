import { ResourceTabsLayout } from '../resources/details/layout/ResourceTabsLayout';
import { MqttServersPage, EditMqttServerPage } from '../mqtt';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { DocumentationEditor, DocumentationView } from '../resources/documentation';
import { ResourceGroupEditPage } from '../resource-groups';
import { MaintenanceHubPage } from '../resources/details/maintenance-hub';
import { ResourceDiagnosticsTab } from '../resources/details/diagnostics/ResourceDiagnosticsTab';
import { ResourceSettingsSection } from '../resources/settings/ResourceSettingsSection';
import { BalenaPage } from '../balena';
export const coreRouteGroup2: RouteConfig[] = [
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
];
