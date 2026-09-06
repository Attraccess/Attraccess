import React, { useCallback, useMemo } from 'react';
import {
  X,
  Settings,
  LogOut,
  User,
  ExternalLink,
  Languages,
  Check,
  PuzzleIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Chip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownPopover,
  Accordion,
  AccordionItem,
  AccordionHeading,
  AccordionTrigger,
  AccordionIndicator,
  AccordionPanel,
  AccordionBody,
  Separator,
  cn,
} from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { useAllRoutes } from '../routes';
import { hasRequiredPermissions } from '../routes/routeAccess';
import de from './sidebar.de.json';
import en from './sidebar.en.json';
import { Logo } from '../../components/logo';
import { SidebarItem, SidebarItemGroup, useSidebarItems, useSidebarEndItems } from './sidebarItems';
import { NavLink as RouterNavLink, useNavigate } from 'react-router-dom';
import usePluginState from '../plugins/plugin.state';
import type { PluginSidebarItem } from '@attraccess/plugins-frontend-sdk';

interface NavLinkProps {
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

function NavLink({ href, label, icon, isExternal, target, indent, badgeCount, collapsed, ...rest }: NavLinkProps) {
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

interface CollapsedGroupDropdownProps {
  label: string;
  icon: React.ReactNode;
  items: { key: string; label: string; icon: React.ReactNode; path: string; isExternal?: boolean }[];
  'data-cy'?: string;
}

// In the collapsed icon rail, accordion groups become icon-triggered dropdowns.
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

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
}

export function Sidebar({ isOpen, toggleSidebar, isCollapsed, toggleCollapsed }: SidebarProps) {
  const { logout, user, hasPermission } = useAuth();
  const { t, language, setLanguage } = useTranslations({
    en,
    de,
  });
  const navigate = useNavigate();

  const routes = useAllRoutes();
  const sidebarItems = useSidebarItems();
  const { plugins } = usePluginState();

  // Sidebar entries contributed by installed frontend plugins. Each plugin's
  // getSidebarItems() is optional and isolated so a throwing plugin can't break
  // the shell. Visibility is still gated by the target route's auth below.
  const pluginNavItems: PluginSidebarItem[] = useMemo(() => {
    return plugins.flatMap((manifest) => {
      try {
        return manifest.plugin.getSidebarItems?.() ?? [];
      } catch (error) {
        console.error(
          `Attraccess Plugin System: getSidebarItems() of plugin "${manifest.plugin.getPluginName()}" threw`,
          error,
        );
        return [];
      }
    });
  }, [plugins]);

  const showNavItem = useCallback(
    (item: SidebarItem) => {
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
  const navigationGroups: SidebarItemGroup[] = useMemo(() => {
    const defaultGroup: SidebarItemGroup = {
      translationKey: '##default##',
      items: [],
      icon: () => null,
      isGroup: true,
    };
    const groups: SidebarItemGroup[] = [defaultGroup];

    sidebarItems.forEach((item) => {
      if ((item as SidebarItem).path) {
        defaultGroup.items.push(item as SidebarItem);
        return;
      }

      groups.push(item as SidebarItemGroup);
    });

    groups.forEach((group) => {
      group.items = (group.items ?? []).filter(showNavItem);
    });

    return groups.filter((group) => group.items.length > 0);
  }, [showNavItem, sidebarItems]);

  const defaultGroupItems = useMemo(() => {
    return navigationGroups.find((group) => group.translationKey === '##default##')?.items;
  }, [navigationGroups]);

  const visiblePluginNavItems = useMemo(() => {
    return pluginNavItems.filter((item) => showNavItem({ path: item.path } as SidebarItem));
  }, [pluginNavItems, showNavItem]);

  const otherGroups = useMemo(() => {
    return navigationGroups.filter((group) => group.translationKey !== '##default##');
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

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-backdrop transition-opacity duration-300 md:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={toggleSidebar}
        aria-hidden="true"
        data-cy="sidebar-mobile-backdrop"
      />

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 ${isCollapsed ? 'w-16' : 'w-64'} bg-surface border-r border-separator border-t-4 border-t-accent transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-[transform,width] duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col`}
      >
        {/* Sidebar Header */}
        <div className={`flex items-center h-16 ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          {!isCollapsed && <Logo data-cy="sidebar-home-link" />}

          <Button
            variant="ghost"
            aria-label={isCollapsed ? t('expandSidebar') : t('collapseSidebar')}
            isIconOnly
            className="hidden md:inline-flex"
            onPress={toggleCollapsed}
            data-cy="sidebar-collapse-button"
          >
            {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </Button>

          <Button
            variant="ghost"
            aria-label="Close sidebar"
            isIconOnly
            className="md:hidden"
            onPress={toggleSidebar}
            data-cy="sidebar-close-button"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>

        <Separator />

        {/* Sidebar Navigation */}
        <div className="flex-grow overflow-y-auto py-4">
          <nav className="px-2 space-y-1">
            {(defaultGroupItems ?? []).map((item) => (
              <NavLink
                key={item.path}
                href={item.path}
                icon={<item.icon size={16} aria-hidden />}
                label={t('groups.##default##.items.' + item.translationKey)}
                data-cy={`sidebar-nav-${item.path?.replace('/', '')}`}
                badgeCount={item.badgeCount}
                collapsed={isCollapsed}
              />
            ))}
            {visiblePluginNavItems.map((item) => (
              <NavLink
                key={item.path}
                href={item.path}
                icon={item.icon ?? <PuzzleIcon size={16} aria-hidden />}
                label={item.label}
                data-cy={`sidebar-plugin-nav-${item.path?.replace(/\//g, '-')}`}
                collapsed={isCollapsed}
              />
            ))}
            {isCollapsed ? (
              otherGroups.map((group) => (
                <CollapsedGroupDropdown
                  key={group.translationKey}
                  label={t('groups.' + group.translationKey + '.label')}
                  icon={<group.icon size={16} aria-hidden />}
                  data-cy={`sidebar-group-${group.translationKey}`}
                  items={group.items.map((item) => ({
                    key: item.path,
                    path: item.path,
                    icon: <item.icon size={16} aria-hidden />,
                    label: t('groups.' + group.translationKey + '.items.' + item.translationKey),
                  }))}
                />
              ))
            ) : (
              <Accordion>
                {otherGroups.map((group) => (
                  <AccordionItem key={group.translationKey} id={group.translationKey}>
                    <AccordionHeading>
                      <AccordionTrigger className="px-2 py-2 text-sm font-normal rounded-md">
                        <span className="flex items-center">
                          <span className="mr-3 flex items-center">
                            <group.icon size={16} aria-hidden />
                          </span>
                          {t('groups.' + group.translationKey + '.label')}
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
                            label={t('groups.' + group.translationKey + '.items.' + item.translationKey)}
                            data-cy={`sidebar-nav-${item.path?.replace('/', '')}`}
                            indent
                          />
                        ))}
                      </AccordionBody>
                    </AccordionPanel>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </nav>
        </div>

        {/* Helpful Links */}
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

        <Separator />

        {/* User section at bottom */}
        <div className={isCollapsed ? 'p-2' : 'p-4'}>
          {user && (
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
              {!isCollapsed && (
                <div className="flex items-center text-sm">
                  <User className="h-4 w-4 mr-2" />
                  <span>{user.username}</span>
                </div>
              )}
              <Dropdown data-cy="sidebar-settings-dropdown">
                <DropdownTrigger
                  // Not "Settings": that name now belongs to the nav entry two rows up. This menu
                  // is language, account and logout.
                  aria-label={t('userMenu')}
                  data-cy="sidebar-settings-button"
                  className={`${buttonVariants({ variant: 'ghost', isIconOnly: true })} !inline-flex items-center justify-center`}
                >
                  <Settings className="h-5 w-5" />
                </DropdownTrigger>
                <DropdownPopover>
                  <DropdownMenu data-cy="sidebar-settings-dropdown-menu">
                    <DropdownItem key="language-label" id="language-label" isDisabled>
                      <Languages className="h-4 w-4" />
                      {t('language')}
                    </DropdownItem>
                    <DropdownItem
                      key="language-en"
                      id="language-en"
                      onPress={() => setLanguage('en')}
                      data-cy="sidebar-language-en"
                    >
                      {t('languages.en')}
                      {language === 'en' ? <Check className="h-4 w-4" /> : null}
                    </DropdownItem>
                    <DropdownItem
                      key="language-de"
                      id="language-de"
                      onPress={() => setLanguage('de')}
                      data-cy="sidebar-language-de"
                    >
                      {t('languages.de')}
                      {language === 'de' ? <Check className="h-4 w-4" /> : null}
                    </DropdownItem>
                    <DropdownItem
                      key="account"
                      id="account"
                      onPress={() => navigate('/account')}
                      data-cy="sidebar-account-button"
                    >
                      <User className="h-4 w-4" />
                      {t('account')}
                    </DropdownItem>
                    <DropdownItem key="logout" id="logout" onPress={() => logout()} data-cy="sidebar-logout-button">
                      <LogOut />
                      {t('logout')}
                    </DropdownItem>
                  </DropdownMenu>
                </DropdownPopover>
              </Dropdown>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
