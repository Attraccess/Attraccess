import { SystemPermissions } from '@attraccess/database-entities';
import { PathRouteProps } from 'react-router-dom';

// Route definition shared by the app shell and frontend plugins.
// `authRequired`: false = public, true = any logged-in user, or one/many required permissions.
export interface RouteConfig extends Omit<PathRouteProps, 'children'> {
  authRequired: boolean | keyof SystemPermissions | (keyof SystemPermissions)[];
}
