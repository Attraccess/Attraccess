import { useEffect } from 'react';
import { useState } from 'react';
import { Route } from 'react-router-dom';
import { Unauthorized } from './unauthorized/unauthorized';
import { useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { hasRequiredPermissions } from './routes/routeAccess';
import { AccessDenied } from './unauthorized/accessDenied';

export function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(pointer: coarse)');
    const handler = (event: MediaQueryListEvent) => setIsTouch(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isTouch;
}

// Exported for settingsAccess.spec.tsx, which drives the real route table through this gate.
export function useRoutesWithAuthElements(routes: RouteConfig[]) {
  const { user, hasPermission } = useAuth();

  const routesWithAuthElements = useMemo(() => {
    return routes.map((route) => {
      if (!route.authRequired) {
        return route;
      }

      if (!user) {
        return {
          ...route,
          element: <Unauthorized />,
        };
      }

      // `true` = any logged-in user, which the check above just established.
      if (route.authRequired === true) {
        return route;
      }

      if (!hasRequiredPermissions(route.authRequired, hasPermission)) {
        return {
          ...route,
          element: <AccessDenied />,
        };
      }

      return route;
    });
  }, [routes, user, hasPermission]);

  return useMemo(
    () =>
      routesWithAuthElements.map((route: RouteConfig) => (
        <Route key={route.path} path={route.path} element={route.element} />
      )),
    [routesWithAuthElements],
  );
}
