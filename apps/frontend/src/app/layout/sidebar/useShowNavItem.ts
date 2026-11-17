import { useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useAllRoutes } from '../../routes/index';
import { hasRequiredPermissions } from '../../routes/routeAccess';
import type { SidebarItem } from './navigation';

/** Returns a predicate telling whether the current user may see a sidebar entry, based on its target route's auth. */
export function useShowNavItem() {
  const { user, hasPermission } = useAuth();
  const routes = useAllRoutes();

  return useCallback(
    (item: Pick<SidebarItem, 'path'>) => {
      const routeOfItem = routes.find((route) => route.path === item.path);

      if (!routeOfItem?.authRequired) {
        return true;
      }

      if (!user) {
        return false;
      }

      if (routeOfItem?.authRequired === true) {
        return true;
      }

      return hasRequiredPermissions(routeOfItem.authRequired, hasPermission);
    },
    [user, hasPermission, routes],
  );
}
