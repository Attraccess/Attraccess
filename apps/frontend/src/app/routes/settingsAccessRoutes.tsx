import { SSOProviderFormPage } from '../sso/providers/SSOProviderFormPage';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { SettingsLayout } from '../settings/layout/SettingsLayout';
import { RolesSection } from '../settings/sections/roles';
import { SsoSection } from '../settings/sections/sso';
import { PluginsSection } from '../settings/sections/plugins';
import { AuditLogSection } from '../settings/sections/audit-log';
import { SecuritySection } from '../settings/sections/security';
export const settingsAccessRoutes: RouteConfig[] = [
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
];
