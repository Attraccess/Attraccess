import { PluginService } from '../plugin-system/plugin.service';
import { arePluginsDisabled } from '../plugin-system/plugins-disabled';

/**
 * Built-in pages a user may pin: the internal entries of the frontend sidebar
 * (`SIDEBAR_ITEMS` and `buildSidebarEndItems` in apps/frontend/src/app/layout/sidebar/navigation.tsx),
 * without `/dashboard` itself and external links. Keep both lists in step; dashboard-page-paths.spec.ts
 * fails when they drift apart.
 */
export const BUILT_IN_DASHBOARD_PAGE_PATHS: readonly string[] = [
  '/resources',
  '/projects',
  '/messages',
  '/attractap/nfc-cards',
  '/billing',
  '/csv-export',
  '/users',
  '/attractap/readers',
  '/devices/flows',
  '/devices/mqtt/servers',
  '/devices/companion',
  '/balena',
  '/settings',
  '/dependencies',
  '/changelog',
  '/printables',
];

/** Whether a page path may be pinned: a built-in sidebar page, or one an active plugin lists in `dashboardPaths`. */
export function isPinnablePagePath(path: string): boolean {
  if (BUILT_IN_DASHBOARD_PAGE_PATHS.includes(path)) return true;
  if (arePluginsDisabled()) return false;
  return PluginService.getPluginsWithLoadStatus().some(
    (plugin) =>
      plugin.status !== 'error' &&
      !PluginService.isPluginQuarantined(plugin) &&
      (plugin.main.frontend?.dashboardPaths ?? []).includes(path),
  );
}
