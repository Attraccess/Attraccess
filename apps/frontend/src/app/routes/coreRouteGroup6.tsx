import { Suspense } from 'react';
import { Spinner } from '@heroui/react';
import { SSOProviderFormPage } from '../sso/providers/SSOProviderFormPage';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import AccountPage from '../account';
import { ProjectsListPage } from '../projects';
import { MessagesPage } from '../messaging';
import { SettingsLayout } from '../settings/layout/SettingsLayout';
import { PluginsSection } from '../settings/sections/plugins';
import { AuditLogSection } from '../settings/sections/audit-log';
import { CompanionSettingsPage } from './index.companion-settings-page';
import { PrintablesPage } from './index.printables-page';
export const coreRouteGroup6: RouteConfig[] = [
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
];
