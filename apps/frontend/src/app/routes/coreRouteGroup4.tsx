import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { CsvExport } from '../csv-export';
import { EmailTemplatesPage } from '../email-templates/EmailTemplatesPage';
import { BillingAdministrationPage } from '../billing/administration';
import { SumUpPage } from '../billing/administration/sumup';
import { SettingsLayout } from '../settings/layout/SettingsLayout';
import { SettingsIndexPage } from '../settings/layout/SettingsIndexPage';
import { SETTINGS_SECTION_PERMISSIONS } from '../settings/layout/settingsSections';
import { GeneralSection } from '../settings/sections/general';
import { MonitoringSection } from '../settings/sections/monitoring';
import { EmailSection } from '../settings/sections/email';
export const coreRouteGroup4: RouteConfig[] = [
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
];
