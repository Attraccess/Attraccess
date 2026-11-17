import { useMemo } from 'react';
import { SidebarItem, SidebarItemGroup, useSidebarEndItems } from './navigation';
import { useShowNavItem } from './useShowNavItem';

/** The bottom ("helpful links") entries of the sidebar, filtered by the current user's access. */
export function useSidebarEndNavigation() {
  const showNavItem = useShowNavItem();
  const sidebarEndItems = useSidebarEndItems();

  // Filtered through showNavItem exactly like the main navigation groups. The end items
  // were all public routes until an authRequired one was added here, at which point
  // an unfiltered list would advertise links that land on Unauthorized for logged-out
  // visitors on public in-layout pages such as /dependencies. Filtering the whole list
  // keeps that from recurring with the next gated entry.
  const { groups: sidebarEndGroups, soloItems: sidebarEndSoloItems } = useMemo(() => {
    const groups: SidebarItemGroup[] = [];
    const soloItems: SidebarItem[] = [];

    sidebarEndItems.forEach((item) => {
      if ((item as SidebarItemGroup).isGroup) {
        const group = item as SidebarItemGroup;
        const items = (group.items ?? []).filter(showNavItem);
        // Drop a group whose every entry was filtered out, rather than render an
        // empty heading.
        if (items.length > 0) groups.push({ ...group, items });
        return;
      }

      if (showNavItem(item as SidebarItem)) soloItems.push(item as SidebarItem);
    });

    return { groups, soloItems };
  }, [sidebarEndItems, showNavItem]);

  return { sidebarEndGroups, sidebarEndSoloItems };
}
