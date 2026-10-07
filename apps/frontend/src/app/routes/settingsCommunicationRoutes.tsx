import { Suspense } from 'react';
import { Spinner } from '@heroui/react';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { EmailTemplatesPage } from '../email-templates/EmailTemplatesPage';
import { SettingsLayout } from '../settings/layout/SettingsLayout';
import { SettingsIndexPage } from '../settings/layout/SettingsIndexPage';
import { SETTINGS_SECTION_PERMISSIONS } from '../settings/layout/settingsSections';
import { GeneralSection } from '../settings/sections/general';
import { MonitoringSection } from '../settings/sections/monitoring';
import { AboutSection } from '../settings/sections/about';
import { EmailSection } from '../settings/sections/email';
import { MessagingSection } from '../settings/sections/messaging';
import { EmailLayoutPage } from './index.state';
import { EditEmailTemplatePage } from './index.state';
export const settingsCommunicationRoutes: RouteConfig[] = [
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
];
