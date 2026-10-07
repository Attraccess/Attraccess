import { Navigate } from 'react-router-dom';
import { KioskLayout } from '../kiosk/layout/KioskLayout';
import { KioskResourcePage } from '../kiosk/resources/KioskResourcePage';
import { KioskCompanionPage } from '../kiosk/companion/KioskCompanionPage';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { Dependencies } from '../dependencies';
import { ConfirmDeleteAccount } from '../confirm-delete-account';
import ChangelogPage from '../changelog/ChangelogPage';
import FirstTimeSetupPage from '../first-time-setup';
import { UnauthorizedLayout } from '../unauthorized/unauthorized-layout/layout';
export const publicRoutes: RouteConfig[] = [
  {
    path: '/kiosk/resources/:id',
    element: (
      <KioskLayout>
        <KioskResourcePage />
      </KioskLayout>
    ),
    authRequired: false,
    noLayout: true,
  },
  {
    path: '/kiosk/companion',
    element: (
      <KioskLayout>
        <KioskCompanionPage />
      </KioskLayout>
    ),
    authRequired: false,
    noLayout: true,
  },
  {
    path: '/',
    element: <Navigate to="/resources" replace />,
    authRequired: true,
  },
  {
    path: '/changelog',
    element: <ChangelogPage />,
    authRequired: false,
  },
  {
    path: '/dependencies',
    element: <Dependencies />,
    authRequired: false,
  },
  {
    path: '/first-time-setup',
    element: (
      <UnauthorizedLayout>
        <FirstTimeSetupPage />
      </UnauthorizedLayout>
    ),
    authRequired: false,
  },
  {
    path: '/confirm-delete-account',
    element: <ConfirmDeleteAccount />,
    authRequired: false,
  },
];
