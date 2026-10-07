import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { ProjectDetailsPage } from '../projects/details';
import { ProjectTeamPage } from '../projects/details/team';
export const coreRouteGroup7: RouteConfig[] = [
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
