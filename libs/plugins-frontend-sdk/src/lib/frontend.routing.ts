import { PathRouteProps } from 'react-router-dom';

// Route definition shared by the app shell and frontend plugins.
// `authRequired`:
//   - `false` — public, no session needed.
//   - `true` — any logged-in user.
//   - a permission key — a logged-in user holding that permission.
//   - an array of permission keys — a logged-in user holding ANY ONE of them (it is an OR, not an
//     AND). Use it for a page that fronts several differently-permissioned things, so whoever may
//     open one of them gets in. An empty array grants nobody access.
// `noLayout`: true = rendered outside the app shell chrome (sidebar/header); used for kiosk routes.
export interface RouteConfig extends Omit<PathRouteProps, 'children'> {
  authRequired: boolean | string | string[];
  noLayout?: boolean;
}
