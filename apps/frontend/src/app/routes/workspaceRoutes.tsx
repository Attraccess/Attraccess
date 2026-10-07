import { Suspense } from 'react';
import { Spinner } from '@heroui/react';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import AccountPage from '../account';
import { ProjectsListPage } from '../projects';
import { MessagesPage } from '../messaging';
import { ProjectDetailsPage } from '../projects/details';
import { ProjectTeamPage } from '../projects/details/team';
import { CompanionSettingsPage } from './index.state';
import { PrintablesPage } from './index.state';
export const workspaceRoutes: RouteConfig[] = [
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
  {
    path: '/projects/:id',
    element: <ProjectDetailsPage />,
    authRequired: true,
  },
  {
    path: '/projects/:id/team',
    element: <ProjectTeamPage />,
    authRequired: true,
  },
];
