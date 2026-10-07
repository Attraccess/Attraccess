import {
  useLicenseServiceGetLicenseInformation,
  useMessagingServiceMessagingGetUnreadCount,
} from '@attraccess/react-query-client';
import { useMemo } from 'react';
import type { SidebarItem } from './sidebarItems.contracts';
import type { SidebarItemGroup } from './sidebarItems.contracts';
import { SIDEBAR_ITEMS } from './sidebarItems.sidebar-items';

export function useSidebarItems(): (SidebarItem | SidebarItemGroup)[] {
  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { data: unread } = useMessagingServiceMessagingGetUnreadCount();

  const allItems = useMemo(() => {
    return SIDEBAR_ITEMS.map((item) => ('showsUnreadCount' in item ? { ...item, badgeCount: unread?.total } : item));
  }, [unread?.total]);

  return useMemo(() => {
    if (!license) {
      return [];
    }

    const itemsMatchingLicense = [] as typeof allItems;

    allItems.forEach((item) => {
      if (item.licenseModule && !license?.modules.includes(item.licenseModule)) {
        return;
      }

      if (!item.isGroup) {
        itemsMatchingLicense.push(item);
        return;
      }

      const itemChildrenMatchingLicense = (item as SidebarItemGroup).items.filter((item) => {
        if (item.licenseModule && !license?.modules.includes(item.licenseModule)) {
          return false;
        }

        return true;
      });

      if (itemChildrenMatchingLicense.length === 0) {
        return;
      }

      itemsMatchingLicense.push({
        ...item,
        items: itemChildrenMatchingLicense,
      });
    });

    return itemsMatchingLicense;
  }, [allItems, license]);
}
