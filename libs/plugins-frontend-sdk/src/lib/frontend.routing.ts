import { PathRouteProps } from 'react-router-dom';

// Route definition shared by the app shell and frontend plugins.
// `authRequired`: false = public, true = any logged-in user, or one/many granular permission keys.
// `noLayout`: true = rendered outside the app shell chrome (sidebar/header); used for kiosk routes.
export interface RouteConfig extends Omit<PathRouteProps, 'children'> {
  authRequired: boolean | string | string[];
  noLayout?: boolean;
}
