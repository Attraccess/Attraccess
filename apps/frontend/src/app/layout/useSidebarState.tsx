import { useCallback, useMemo, useRef, useState } from 'react';
import { PuzzleIcon } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAllRoutes } from '../routes';
import { hasRequiredPermissions } from '../routes/routeAccess';
import de from './sidebar.de.json';
import en from './sidebar.en.json';
import { SidebarItem, SidebarItemGroup, useSidebarItems, useSidebarEndItems } from './sidebarItems';
import { useNavigate } from 'react-router-dom';
import { usePluginSidebarContributions } from './usePluginSidebarContributions';
import { useAppTheme } from '@attraccess/ui';
import { NavLinkProps } from './sidebar.contracts';
import { SidebarProps } from './sidebar.contracts';
import { NavigationGroup } from './sidebar.contracts';
export function useSidebarState({ isOpen, toggleSidebar, isCollapsed, toggleCollapsed }: SidebarProps) {
  const { logout, user, hasPermission } = useAuth();
  const { t, language, setLanguage } = useTranslations({
    en,
    de,
  });
  const navigate = useNavigate();
  const { theme, setTheme } = useAppTheme();
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const keepSettingsMenuOpen = useRef(false);

  const cycleTheme = () => {
    keepSettingsMenuOpen.current = true;
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
    window.requestAnimationFrame(() => {
      keepSettingsMenuOpen.current = false;
    });
  };

  const handleSettingsMenuOpenChange = (isOpen: boolean) => {
    if (!isOpen && keepSettingsMenuOpen.current) return;
    setIsSettingsMenuOpen(isOpen);
  };

  const routes = useAllRoutes();
  const sidebarItems = useSidebarItems();

  const { pluginNavItems, pluginNavGroups } = usePluginSidebarContributions();

  const showNavItem = useCallback(
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

  const sidebarEndItems = useSidebarEndItems();

  // Filtered through showNavItem exactly like navigationGroups above. The end items
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
  return {
    logout,
    user,
    t,
    language,
    setLanguage,
    navigate,
    theme,
    isSettingsMenuOpen,
    cycleTheme,
    handleSettingsMenuOpenChange,
    defaultGroupItems,
    otherGroups,
    sidebarEndGroups,
    sidebarEndSoloItems,
    isOpen,
    toggleSidebar,
    isCollapsed,
    toggleCollapsed,
  } as const;
}
