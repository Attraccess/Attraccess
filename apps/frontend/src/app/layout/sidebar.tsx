import React, { useCallback, useMemo } from 'react';
import { X, Settings, LogOut, User, ExternalLink, Languages, Check } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Link,
  Accordion,
  AccordionItem,
  LinkProps,
} from '@heroui/react';
import { useAllRoutes } from '../routes';
import { SystemPermissions } from '@attraccess/react-query-client';
import de from './sidebar.de.json';
import en from './sidebar.en.json';
import { Logo } from '../../components/logo';
import { SidebarItem, SidebarItemGroup, useSidebarItems, useSidebarEndItems } from './sidebarItems';
import { useNavigate } from 'react-router-dom';

function NavLink(
  props: Omit<LinkProps, 'children'> & {
    label: string;
    icon: React.ReactNode;
    isExternal?: boolean;
    'data-cy'?: string;
  },
) {
  return (
    <Link
      {...props}
      target={(props.target ?? props.isExternal) ? '_blank' : undefined}
      className="flex items-center px-2 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
      color="foreground"
      underline="none"
    >
      <span className="mr-3">{props.icon}</span>
      <span className="flex-1">{props.label}</span>
      {props.isExternal && <ExternalLink className="ml-2" />}
    </Link>
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

  const otherGroups = useMemo(() => {
    return navigationGroups.filter((group) => group.translationKey !== '##default##');
  }, [navigationGroups]);

  const sidebarEndItems = useSidebarEndItems();

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
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-lg transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
          <Logo data-cy="sidebar-home-link" />

          <Button
            variant="light"
            aria-label="Close sidebar"
            isIconOnly
            className="md:hidden"
            onPress={toggleSidebar}
            data-cy="sidebar-close-button"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>

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
              />
            ))}
            <Accordion defaultSelectedKeys={['##default##']}>
              {otherGroups.map((group) => (
                <AccordionItem
                  key={group.translationKey}
                  title={t('groups.' + group.translationKey + '.label')}
                  startContent={<group.icon size={16} />}
                >
                  {group.items.map((item) => (
                    <NavLink
                      key={item.path}
                      href={item.path}
                      icon={<item.icon size={16} />}
                      label={t('groups.' + group.translationKey + '.items.' + item.translationKey)}
                      data-cy={`sidebar-nav-${item.path?.replace('/', '')}`}
                    />
                  ))}
                </AccordionItem>
              ))}
            </Accordion>
          </nav>
        </div>

        {/* Helpful Links */}
        <div className="py-4">
          <nav className="px-2 space-y-1">
            {sidebarEndItems.map((item) => (
              <NavLink
                key={item.path}
                href={item.path}
                icon={<item.icon size={16} />}
                label={t('endItems.' + item.translationKey)}
                data-cy={`sidebar-nav-${item.path?.replace('/', '')}`}
                size="sm"
                isExternal={item.isExternal}
                showAnchorIcon={false}
              />
            ))}
          </nav>
        </div>

        {/* User section at bottom */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          {user && (
            <div className="flex items-center justify-between">
              <div className="flex items-center text-sm">
                <User className="h-4 w-4 mr-2" />
                <span>{user.username}</span>
              </div>
              <Dropdown data-cy="sidebar-settings-dropdown" placement="top-end">
                <DropdownTrigger>
                  <Button variant="light" aria-label="Settings" isIconOnly data-cy="sidebar-settings-button">
                    <Settings className="h-5 w-5" />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu data-cy="sidebar-settings-dropdown-menu">
                  <DropdownItem key="language-label" isDisabled startContent={<Languages className="h-4 w-4" />}>
                    {t('language')}
                  </DropdownItem>
                  <DropdownItem
                    key="language-en"
                    onPress={() => setLanguage('en')}
                    endContent={language === 'en' ? <Check className="h-4 w-4" /> : null}
                    data-cy="sidebar-language-en"
                  >
                    {t('languages.en')}
                  </DropdownItem>
                  <DropdownItem
                    key="language-de"
                    onPress={() => setLanguage('de')}
                    endContent={language === 'de' ? <Check className="h-4 w-4" /> : null}
                    data-cy="sidebar-language-de"
                  >
                    {t('languages.de')}
                  </DropdownItem>
                  <DropdownItem
                    key="account"
                    onPress={() => navigate('/account')}
                    startContent={<User className="h-4 w-4" />}
                    data-cy="sidebar-account-button"
                  >
                    {t('account')}
                  </DropdownItem>
                  <DropdownItem
                    key="logout"
                    onPress={() => logout()}
                    startContent={<LogOut />}
                    data-cy="sidebar-logout-button"
                  >
                    {t('logout')}
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
