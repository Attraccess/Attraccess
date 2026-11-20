import { useCallback } from 'react';
import { useGetLicenseInformation } from '@attraccess/react-query-client';
import { SIDEBAR_ITEMS, SidebarItem } from '../../layout/sidebar/navigation';
import { useShowNavItem } from '../../layout/sidebar/useShowNavItem';
import { useAuth } from '../../../hooks/useAuth';

// The license module the sidebar requires for a path, from the entry itself or its group.
const LICENSE_MODULE_BY_PATH = new Map(
  SIDEBAR_ITEMS.flatMap((item) =>
    item.isGroup
      ? item.items.map((entry): [string, string | undefined] => [entry.path, entry.licenseModule ?? item.licenseModule])
      : [[(item as SidebarItem).path, item.licenseModule] as [string, string | undefined]],
  ),
);

/**
 * Whether the user may open a page, by the same rules as the sidebar: the route's auth requirement and, for sidebar
 * pages, their license module. Widgets gate themselves and each of their links with it.
 */
export function useCanOpenPage() {
  const showNavItem = useShowNavItem();
  const { isAuthenticated } = useAuth();
  // Also used on the logged-out pages of the layout, where the license cannot be read.
  const { data: license } = useGetLicenseInformation({}, undefined, { enabled: isAuthenticated });

  return useCallback(
    (path: string) => {
      const licenseModule = LICENSE_MODULE_BY_PATH.get(path);
      if (licenseModule && !license?.modules.includes(licenseModule)) return false;
      return showNavItem({ path });
    },
    [showNavItem, license],
  );
}
