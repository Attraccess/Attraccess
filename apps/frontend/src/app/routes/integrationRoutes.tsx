import { Navigate } from 'react-router-dom';
import { MqttServersPage, EditMqttServerPage } from '../mqtt';
import { UserManagementPage } from '../user-management';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { AttractapList } from '../attractap/AttractapList';
import { AttractapDiagnosticsPage } from '../attractap/AttractapDiagnosticsPage';
import { RfidCardList } from '../attractap/RfidCardList';
import { UserManagementDetailsPage } from '../user-management/details';
import { BalenaPage } from '../balena';
export const integrationRoutes: RouteConfig[] = [
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
];
