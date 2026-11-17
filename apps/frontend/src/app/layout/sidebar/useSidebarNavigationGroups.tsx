import { useMemo } from 'react';
import { PuzzleIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from '../sidebar.de.json';
import en from '../sidebar.en.json';
import type { NavLinkProps } from './NavLink';
import { SidebarItem, useSidebarItems } from './navigation';
import { usePluginSidebarContributions } from './usePluginSidebarContributions';
import { useShowNavItem } from './useShowNavItem';

export interface NavigationGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavLinkProps[];
}

/** Navigation groups of the main sidebar area (built-in routes plus plugin contributions), split into the ungrouped items and the named groups. */
export function useSidebarNavigationGroups() {
  const { t } = useTranslations({ en, de });
  const sidebarItems = useSidebarItems();
  const { pluginNavItems, pluginNavGroups } = usePluginSidebarContributions();
  const showNavItem = useShowNavItem();

  // Get navigation items from routes that have sidebar config
  const navigationGroups: NavigationGroup[] = useMemo(() => {
    const defaultGroup: NavigationGroup = {
      id: '##default##',
      label: '',
      items: [],
      icon: null,
    };
    const groups: NavigationGroup[] = [defaultGroup];

    const navItem = (item: SidebarItem, groupKey: string): NavLinkProps => ({
      href: item.path,
      label: t('groups.' + groupKey + '.items.' + item.translationKey),
      icon: <item.icon size={16} aria-hidden />,
      badgeCount: item.badgeCount,
      isExternal: item.isExternal,
      'data-cy': `sidebar-nav-${item.path.replace('/', '')}`,
    });

    sidebarItems.forEach((item) => {
      if ('path' in item) {
        if (showNavItem(item)) defaultGroup.items.push(navItem(item, defaultGroup.id));
        return;
      }

      groups.push({
        id: item.translationKey,
        label: t('groups.' + item.translationKey + '.label'),
        icon: <item.icon size={16} aria-hidden />,
        items: item.items.filter(showNavItem).map((child) => navItem(child, item.translationKey)),
      });
    });

    pluginNavGroups.forEach((group) => {
      if (!group.id || groups.some((existing) => existing.id === group.id)) return;
      groups.push({
        id: group.id,
        label: group.label,
        icon: group.icon ?? <PuzzleIcon size={16} aria-hidden />,
        items: [],
      });
    });

    pluginNavItems.filter(showNavItem).forEach((item) => {
      const group = groups.find((group) => group.id === item.group) ?? defaultGroup;
      group.items.push({
        href: item.path,
        label: item.label,
        icon: item.icon ?? <PuzzleIcon size={16} aria-hidden />,
        'data-cy': `sidebar-plugin-nav-${item.path.replace(/\//g, '-')}`,
      });
    });

    return groups.filter((group) => group.items.length > 0);
  }, [showNavItem, sidebarItems, pluginNavItems, pluginNavGroups, t]);

  const defaultGroupItems = useMemo(() => {
    return navigationGroups.find((group) => group.id === '##default##')?.items;
  }, [navigationGroups]);

  const otherGroups = useMemo(() => {
    return navigationGroups.filter((group) => group.id !== '##default##');
  }, [navigationGroups]);

  return { defaultGroupItems, otherGroups };
}
