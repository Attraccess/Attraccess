import { Navigate } from 'react-router-dom';
import { UserManagementPage } from '../user-management';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { AttractapList } from '../attractap/AttractapList';
import { AttractapDiagnosticsPage } from '../attractap/AttractapDiagnosticsPage';
import { RfidCardList, UserRfidCardsPage } from '../attractap/RfidCardList';
import { UserManagementDetailsPage } from '../user-management/details';
import { BillingDashboardPage } from '../billing/dashboard';
export const coreRouteGroup3: RouteConfig[] = [
  {
    path: '/users',
    element: <UserManagementPage />,
    authRequired: 'users.read',
  },
  {
    path: '/users/:id',
    element: <UserManagementDetailsPage />,
    authRequired: 'users.read',
  },
  {
    path: '/users/:id/rfid-cards',
    element: <UserRfidCardsPage />,
    authRequired: 'users.rfid-cards.manage',
  },
  {
    path: '/attractap',
    element: <Navigate to="/attractap/nfc-cards" replace />,
    authRequired: true,
  },
  {
    path: '/attractap/nfc-cards',
    element: <RfidCardList />,
    authRequired: true,
  },
  {
    path: '/attractap/readers',
    element: <AttractapList />,
    authRequired: 'resources.update',
  },
  {
    path: '/attractap/readers/:readerId/diagnostics',
    element: <AttractapDiagnosticsPage />,
    authRequired: 'resources.update',
  },
  {
    path: '/billing',
    element: <BillingDashboardPage />,
    authRequired: true,
  },
];
