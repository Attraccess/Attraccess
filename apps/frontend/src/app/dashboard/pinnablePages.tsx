import { PropsWithChildren, useMemo } from 'react';
import { PuzzleIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import {
  buildSidebarEndItems,
  SIDEBAR_ITEMS,
  SidebarItem,
  SidebarItemGroup,
  useSidebarItems,
} from '../layout/sidebar/navigation';
import { usePluginSidebarContributions, useShowNavItem } from '../layout/sidebar/HelpfulLinks';
import usePluginState from '../plugins/plugin.state';
import sidebarDe from '../layout/sidebar.de.json';
import sidebarEn from '../layout/sidebar.en.json';
import { PinnablePage, PinnablePages, PinnablePagesContext } from './pinnablePagesContext';

const DASHBOARD_PATH = '/dashboard';

type Translate = (key: string) => string;

// Mirrors the translation keys the sidebar uses for the same entries.
function builtInPages(items: (SidebarItem | SidebarItemGroup)[], prefix: string, t: Translate) {
  return items.flatMap((item) =>
    (item.isGroup ? item.items : [item as SidebarItem])
      .filter((entry) => !entry.isExternal && entry.path !== DASHBOARD_PATH)
      .map((entry): PinnablePage => ({
        path: entry.path,
        title: item.isGroup
          ? t(`${prefix}groups.${item.translationKey}.items.${entry.translationKey}`)
          : t(prefix ? `${prefix}${entry.translationKey}` : `groups.##default##.items.${entry.translationKey}`),
        icon: <entry.icon size={20} aria-hidden />,
        badgeCount: entry.badgeCount,
      })),
  );
}

/**
 * The pages a user can pin, built from the same registry and access checks as the sidebar: built-in sidebar entries
 * (license and route permissions applied) and plugin sidebar entries whose plugin lists them in `dashboardPaths`.
 */
function useComputedPinnablePages(): PinnablePages {
  const { t } = useTranslations({ en: sidebarEn, de: sidebarDe });
  const { data: license } = useLicenseServiceGetLicenseInformation();
  const licensedItems = useSidebarItems();
  const showNavItem = useShowNavItem();
  const { pluginNavItems } = usePluginSidebarContributions();
  const plugins = usePluginState((state) => state.plugins);
  const arePluginsInitialized = usePluginState((state) => state.isInitialized);

  return useMemo(() => {
    const endItems = buildSidebarEndItems('', '');
    const pluginPaths = new Set(plugins.flatMap((manifest) => manifest.main.frontend?.dashboardPaths ?? []));
    const pluginPages = pluginNavItems
      .filter((item) => pluginPaths.has(item.path))
      .map((item): PinnablePage => ({
        path: item.path,
        title: item.label,
        icon: item.icon ?? <PuzzleIcon size={20} aria-hidden />,
      }));

    const known = [...builtInPages(SIDEBAR_ITEMS, '', t), ...builtInPages(endItems, 'endItems.', t), ...pluginPages];
    const pages = [
      ...builtInPages(licensedItems, '', t),
      ...builtInPages(endItems, 'endItems.', t),
      ...pluginPages,
    ].filter(showNavItem);

    return {
      pages,
      titleOf: (path: string) => known.find((page) => page.path === path)?.title,
      isReady: !!license && arePluginsInitialized,
    };
  }, [t, license, licensedItems, showNavItem, pluginNavItems, plugins, arePluginsInitialized]);
}

export function PinnablePagesProvider({ children }: PropsWithChildren) {
  const pinnablePages = useComputedPinnablePages();
  return <PinnablePagesContext.Provider value={pinnablePages}>{children}</PinnablePagesContext.Provider>;
}
