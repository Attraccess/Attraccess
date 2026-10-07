import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { CsvExport } from '../csv-export';
import { BillingDashboardPage } from '../billing/dashboard';
import { BillingAdministrationPage } from '../billing/administration';
import { SumUpPage } from '../billing/administration/sumup';
export const billingRoutes: RouteConfig[] = [
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
];
