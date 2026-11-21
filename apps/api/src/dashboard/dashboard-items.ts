import { PluginService } from '../plugin-system/plugin.service';
import { arePluginsDisabled } from '../plugin-system/plugins-disabled';

/**
 * Built-in pages a user may pin: the internal entries of the frontend sidebar
 * (`SIDEBAR_ITEMS` and `buildSidebarEndItems` in apps/frontend/src/app/layout/sidebar/navigation.tsx),
 * without `/dashboard` itself and external links. Keep both lists in step; dashboard-items.spec.ts
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
  '/forms',
  '/devices/mqtt/servers',
  '/devices/companion',
  '/balena',
  '/settings',
  '/dependencies',
  '/changelog',
  '/printables',
];

/**
 * Built-in dashboard widgets: the ids of the frontend widget registry (apps/frontend/src/app/dashboard/widgets/ids.ts).
 * dashboard-items.spec.ts fails when both lists drift apart.
 */
export const BUILT_IN_DASHBOARD_WIDGET_IDS: readonly string[] = [
  'messages',
  'resources',
  'users',
  'my-sessions',
  'billing-balance',
  'readers',
  'resources-in-use',
];

type FrontendManifestList = 'dashboardPaths' | 'dashboardWidgets';

function isDeclaredByActivePlugin(list: FrontendManifestList, value: string): boolean {
  if (arePluginsDisabled()) return false;
  return PluginService.getPluginsWithLoadStatus().some(
    (plugin) =>
      plugin.status !== 'error' &&
      !PluginService.isPluginQuarantined(plugin) &&
      (plugin.main.frontend?.[list] ?? []).includes(value),
  );
}

/** Whether a page path may be pinned: a built-in sidebar page, or one an active plugin lists in `dashboardPaths`. */
export function isPinnablePagePath(path: string): boolean {
  return BUILT_IN_DASHBOARD_PAGE_PATHS.includes(path) || isDeclaredByActivePlugin('dashboardPaths', path);
}

/** Whether a widget may be pinned: a built-in widget, or one an active plugin lists in `dashboardWidgets`. */
export function isPinnableWidgetId(id: string): boolean {
  return BUILT_IN_DASHBOARD_WIDGET_IDS.includes(id) || isDeclaredByActivePlugin('dashboardWidgets', id);
}
