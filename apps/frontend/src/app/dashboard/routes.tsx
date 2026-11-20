import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { DashboardLanding, DashboardPage } from './index';

/** `/` is the dashboard for users with pins and the resource overview for everyone else. */
export const dashboardRoutes: RouteConfig[] = [
  { path: '/', element: <DashboardLanding />, authRequired: true },
  { path: '/dashboard', element: <DashboardPage />, authRequired: true },
];
