import {
  Accordion,
  AccordionItem,
  AccordionHeading,
  AccordionTrigger,
  AccordionIndicator,
  AccordionPanel,
  AccordionBody,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownPopover,
  Chip,
  cn,
} from '@heroui/react';
import { ExternalLink, PuzzleIcon } from 'lucide-react';
import { buttonVariants } from '@heroui/styles';
import { useNavigate, NavLink as RouterNavLink } from 'react-router-dom';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAllRoutes } from '../../routes/index';
import { hasRequiredPermissions } from '../../routes/routeAccess';
import de from '../sidebar.de.json';
import en from '../sidebar.en.json';
import { SidebarItem, SidebarItemGroup, useSidebarItems, useSidebarEndItems } from './navigation';
import { useAppTheme } from '@attraccess/ui';
import usePluginState from '../../plugins/plugin.state';
import type { PluginSidebarGroup, PluginSidebarItem } from '@attraccess/plugins-frontend-sdk';

export function usePluginSidebarContributions() {
  const model = usePluginState();
  // Sidebar entries contributed by installed frontend plugins. Each plugin's
  // getSidebarItems() is optional and isolated so a throwing plugin can't break
  // the shell. Visibility is still gated by the target route's auth below.
  const pluginNavItems: PluginSidebarItem[] = useMemo(() => {
    return model.plugins.flatMap((manifest) => {
      try {
        return manifest.plugin.getSidebarItems?.() ?? [];
      } catch (error) {
        // eslint-disable-next-line no-console -- Report isolated plugin failures without breaking navigation.
        console.error(
          `Attraccess Plugin System: getSidebarItems() of plugin "${manifest.plugin.getPluginName()}" threw`,
          error,
        );
        return [];
      }
    });
  }, [model.plugins]);

  const pluginNavGroups: PluginSidebarGroup[] = useMemo(() => {
    return model.plugins.flatMap((manifest) => {
      try {
        return manifest.plugin.getSidebarGroups?.() ?? [];
      } catch (error) {
        // eslint-disable-next-line no-console -- Report isolated plugin failures without breaking navigation.
        console.error(
          `Attraccess Plugin System: getSidebarGroups() of plugin "${manifest.plugin.getPluginName()}" threw`,
          error,
        );
        return [];
      }
    });
  }, [model.plugins]);

  return { pluginNavItems, pluginNavGroups };
}

export interface CollapsedGroupDropdownProps {
  label: string;
  icon: React.ReactNode;
  items: { key: string; label: string; icon: React.ReactNode; path: string; isExternal?: boolean }[];
  'data-cy'?: string;
}

export interface NavLinkProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  isExternal?: boolean;
  target?: string;
  indent?: boolean;
  badgeCount?: number;
  collapsed?: boolean;
  'data-cy'?: string;
}

export interface NavigationGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavLinkProps[];
}

export interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
}

export function useSidebarState({ isOpen, toggleSidebar, isCollapsed, toggleCollapsed }: SidebarProps) {
  const {
    logout,
    logoutEverywhere,
    logoutPending,
    canLogoutEverywhere,
    logoutUnavailableReason,
    logoutEverywhereLabel,
    logoutPendingLabel,
    logoutProviderNotice,
    user,
    hasPermission,
  } = useAuth();
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
    logoutEverywhere,
    logoutPending,
    canLogoutEverywhere,
    logoutUnavailableReason,
    logoutEverywhereLabel,
    logoutPendingLabel,
    logoutProviderNotice,
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

export // In the collapsed icon rail, accordion groups become icon-triggered dropdowns.
function CollapsedGroupDropdown({ label, icon, items, ...rest }: CollapsedGroupDropdownProps) {
  const navigate = useNavigate();

  return (
    <Dropdown {...rest}>
      <DropdownTrigger
        aria-label={label}
        className={`${buttonVariants({ variant: 'ghost' })} !flex w-full items-center justify-center px-2 py-2 h-auto`}
      >
        {icon}
      </DropdownTrigger>
      <DropdownPopover placement="right top">
        <DropdownMenu aria-label={label}>
          {items.map((item) => (
            <DropdownItem
              key={item.key}
              id={item.key}
              onPress={() => (item.isExternal ? window.open(item.path, '_blank', 'noreferrer') : navigate(item.path))}
            >
              {item.icon}
              {item.label}
              {item.isExternal ? <ExternalLink className="h-4 w-4" /> : null}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  );
}

export function NavLink({
  href,
  label,
  icon,
  isExternal,
  target,
  indent,
  badgeCount,
  collapsed,
  ...rest
}: NavLinkProps) {
  const resolvedTarget = target ?? (isExternal ? '_blank' : undefined);
  const paddingClass = indent && !collapsed ? 'pl-6 pr-2' : 'px-2';
  const className = `${
    collapsed ? 'relative justify-center' : ''
  } flex items-center ${paddingClass} py-2.5 rounded-lg border-l-2 border-transparent text-sm text-foreground no-underline hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2`;
  const badge =
    badgeCount && badgeCount > 0 ? (
      collapsed ? (
        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" data-cy="sidebar-nav-badge" />
      ) : (
        <Chip color="accent" variant="primary" size="sm" className="ml-2 shrink-0" data-cy="sidebar-nav-badge">
          {badgeCount > 99 ? '99+' : badgeCount}
        </Chip>
      )
    ) : null;

  if (isExternal) {
    return (
      <a
        {...rest}
        href={href}
        target={resolvedTarget}
        rel={resolvedTarget === '_blank' ? 'noreferrer' : undefined}
        className={className}
        title={collapsed ? label : undefined}
      >
        <span className={collapsed ? '' : 'mr-3'}>{icon}</span>
        {!collapsed && <span className="flex-1">{label}</span>}
        {!collapsed && <ExternalLink className="ml-2 mr-2 h-4 w-4" />}
      </a>
    );
  }

  return (
    <RouterNavLink
      {...rest}
      to={href}
      target={resolvedTarget}
      className={({ isActive }) =>
        cn(
          className,
          isActive &&
            'border-l-accent bg-accent-soft text-accent-soft-foreground font-semibold hover:bg-accent-soft-hover',
        )
      }
      title={collapsed ? label : undefined}
    >
      <span className={collapsed ? '' : 'mr-3'}>{icon}</span>
      {!collapsed && <span className="flex-1">{label}</span>}
      {badge}
    </RouterNavLink>
  );
}

type Props = Pick<ReturnType<typeof useSidebarState>, 'isCollapsed' | 'sidebarEndGroups' | 'sidebarEndSoloItems' | 't'>;

export function HelpfulLinks({ isCollapsed, sidebarEndGroups, sidebarEndSoloItems, t }: Props) {
  return (
    <div className="py-4">
      <nav className="px-2 space-y-1">
        {isCollapsed ? (
          sidebarEndGroups.map((group) => (
            <CollapsedGroupDropdown
              key={group.translationKey}
              label={t('endItems.groups.' + group.translationKey + '.label')}
              icon={<group.icon size={16} aria-hidden />}
              data-cy={`sidebar-group-${group.translationKey}`}
              items={group.items.map((item) => ({
                key: item.path,
                path: item.path,
                icon: <item.icon size={16} aria-hidden />,
                label: t('endItems.groups.' + group.translationKey + '.items.' + item.translationKey),
                isExternal: item.isExternal,
              }))}
            />
          ))
        ) : (
          <Accordion>
            {sidebarEndGroups.map((group) => (
              <AccordionItem key={group.translationKey} id={group.translationKey} className="text-sm">
                <AccordionHeading>
                  <AccordionTrigger className="px-2 py-2 text-sm font-normal rounded-md">
                    <span className="flex items-center">
                      <span className="mr-3 flex items-center">
                        <group.icon size={16} aria-hidden />
                      </span>
                      {t('endItems.groups.' + group.translationKey + '.label')}
                    </span>
                    <AccordionIndicator />
                  </AccordionTrigger>
                </AccordionHeading>
                <AccordionPanel>
                  <AccordionBody className="px-0 pt-0 pb-0">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.path}
                        href={item.path}
                        icon={<item.icon size={16} aria-hidden />}
                        label={t('endItems.groups.' + group.translationKey + '.items.' + item.translationKey)}
                        isExternal={item.isExternal}
                        indent
                      />
                    ))}
                  </AccordionBody>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        )}
        {sidebarEndSoloItems.map((item) => (
          <NavLink
            key={item.path}
            href={item.path}
            icon={<item.icon size={16} aria-hidden />}
            label={t('endItems.' + item.translationKey)}
            data-cy={`sidebar-nav-${item.path?.replace('/', '')}`}
            isExternal={item.isExternal}
            collapsed={isCollapsed}
          />
        ))}
      </nav>
    </div>
  );
}
