import React, { useCallback, useMemo } from 'react';
import { X, Settings, LogOut, User, ExternalLink, Languages, Check, PackageIcon } from 'lucide-react';
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
} from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { useAllRoutes } from '../routes';
import { SystemPermissions } from '@attraccess/react-query-client';
import de from './sidebar.de.json';
import en from './sidebar.en.json';
import { Logo } from '../../components/logo';
import { SidebarItem, SidebarItemGroup, useSidebarItems, useSidebarEndItems } from './sidebarItems';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
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
  'data-cy'?: string;
}

function NavLink({ href, label, icon, isExternal, target, indent, badgeCount, ...rest }: NavLinkProps) {
  const resolvedTarget = target ?? (isExternal ? '_blank' : undefined);
  const paddingClass = indent ? 'pl-6 pr-2' : 'px-2';
  const className = `flex items-center ${paddingClass} py-2 rounded-md text-sm text-default-foreground no-underline hover:bg-default hover:text-default-foreground`;
  const badge =
    badgeCount && badgeCount > 0 ? (
      <Chip color="accent" variant="primary" size="sm" className="ml-2 shrink-0" data-cy="sidebar-nav-badge">
        {badgeCount > 99 ? '99+' : badgeCount}
      </Chip>
    ) : null;

  if (isExternal) {
    return (
      <a
        {...rest}
        href={href}
        target={resolvedTarget}
        rel={resolvedTarget === '_blank' ? 'noreferrer' : undefined}
        className={className}
      >
        <span className="mr-3">{icon}</span>
        <span className="flex-1">{label}</span>
        <ExternalLink className="ml-2 mr-2 h-4 w-4" />
      </a>
    );
  }

  return (
    <RouterLink {...rest} to={href} target={resolvedTarget} className={className}>
      <span className="mr-3">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge}
    </RouterLink>
  );
}

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

export function Sidebar({ isOpen, toggleSidebar }: SidebarProps) {
  const { logout, user } = useAuth();
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

      const requiredPermissions = (
        Array.isArray(routeOfItem?.authRequired) ? routeOfItem?.authRequired : [routeOfItem?.authRequired]
      ) as (keyof SystemPermissions)[];

      const userHasAllRequiredPermissions = requiredPermissions.every(
        (permission) => user.systemPermissions[permission] === true,
      );

      return userHasAllRequiredPermissions;
    },
    [user, routes],
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

  const { groups: sidebarEndGroups, soloItems: sidebarEndSoloItems } = useMemo(() => {
    const groups: SidebarItemGroup[] = [];
    const soloItems: SidebarItem[] = [];

    sidebarEndItems.forEach((item) => {
      if ((item as SidebarItemGroup).isGroup) {
        groups.push(item as SidebarItemGroup);
        return;
      }

      soloItems.push(item as SidebarItem);
    });

    return { groups, soloItems };
  }, [sidebarEndItems]);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-gray-600 bg-opacity-75 transition-opacity duration-300 md:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={toggleSidebar}
        aria-hidden="true"
        data-cy="sidebar-mobile-backdrop"
      />

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-surface border-r border-separator/40 transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 px-4">
          <Logo data-cy="sidebar-home-link" />

          <Button variant="ghost"
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
                icon={<item.icon size={16} />}
                label={t('groups.##default##.items.' + item.translationKey)}
                data-cy={`sidebar-nav-${item.path?.replace('/', '')}`}
                badgeCount={item.badgeCount}
              />
            ))}
            {visiblePluginNavItems.map((item) => (
              <NavLink
                key={item.path}
                href={item.path}
                icon={item.icon ?? <PackageIcon size={16} />}
                label={item.label}
                data-cy={`sidebar-plugin-nav-${item.path?.replace(/\//g, '-')}`}
              />
            ))}
            <Accordion>
              {otherGroups.map((group) => (
                <AccordionItem
                  key={group.translationKey} id={group.translationKey}
                >
                  <AccordionHeading>
                    <AccordionTrigger className="px-2 py-2 text-sm font-normal rounded-md">
                      <span className="flex items-center">
                        <span className="mr-3 flex items-center">
                          <group.icon size={16} />
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
                          icon={<item.icon size={16} />}
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
          </nav>
        </div>

        {/* Helpful Links */}
        <div className="py-4">
          <nav className="px-2 space-y-1">
            <Accordion>
              {sidebarEndGroups.map((group) => (
                <AccordionItem
                  key={group.translationKey} id={group.translationKey}
                  className="text-sm"
                >
                  <AccordionHeading>
                    <AccordionTrigger className="px-2 py-2 text-sm font-normal rounded-md">
                      <span className="flex items-center">
                        <span className="mr-3 flex items-center">
                          <group.icon size={16} />
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
                          icon={<item.icon size={16} />}
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
            {sidebarEndSoloItems.map((item) => (
              <NavLink
                key={item.path}
                href={item.path}
                icon={<item.icon size={16} />}
                label={t('endItems.' + item.translationKey)}
                data-cy={`sidebar-nav-${item.path?.replace('/', '')}`}

                isExternal={item.isExternal}

              />
            ))}
          </nav>
        </div>

        <Separator />

        {/* User section at bottom */}
        <div className="p-4">
          {user && (
            <div className="flex items-center justify-between">
              <div className="flex items-center text-sm">
                <User className="h-4 w-4 mr-2" />
                <span>{user.username}</span>
              </div>
              <Dropdown data-cy="sidebar-settings-dropdown">
                <DropdownTrigger
                  aria-label="Settings"
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
                    <DropdownItem
                      key="logout"
                      id="logout"
                      onPress={() => logout()}
                      data-cy="sidebar-logout-button"
                    >
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
