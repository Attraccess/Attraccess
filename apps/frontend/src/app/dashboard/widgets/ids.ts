/**
 * Ids of the built-in dashboard widgets. They are stored in users' dashboards, so never rename one. The API accepts
 * exactly these (BUILT_IN_DASHBOARD_WIDGET_IDS in apps/api/src/dashboard/dashboard-items.ts); a spec there fails when
 * both lists drift apart. Keep one id per line.
 */
export const BUILT_IN_WIDGET_IDS = [
  'messages',
  'resources',
  'users',
  'my-sessions',
  'billing-balance',
  'readers',
] as const;

export type BuiltInWidgetId = (typeof BUILT_IN_WIDGET_IDS)[number];
