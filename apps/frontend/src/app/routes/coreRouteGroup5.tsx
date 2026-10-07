import { Suspense } from 'react';
import { Spinner } from '@heroui/react';
import { SSOProviderFormPage } from '../sso/providers/SSOProviderFormPage';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { SettingsLayout } from '../settings/layout/SettingsLayout';
import { AboutSection } from '../settings/sections/about';
import { RolesSection } from '../settings/sections/roles';
import { SsoSection } from '../settings/sections/sso';
import { MessagingSection } from '../settings/sections/messaging';
import { SecuritySection } from '../settings/sections/security';
import { EmailLayoutPage } from './index.email-layout-page';
import { EditEmailTemplatePage } from './index.edit-email-template-page';
export const coreRouteGroup5: RouteConfig[] = [
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
];
