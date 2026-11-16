import { User } from '@attraccess/database-entities';
import { ReactNode } from 'react';
import { IPlugin } from 'react-pluggable';
import { RouteConfig } from './frontend.routing';
import { PluginSlotContribution } from './frontend.slots';

export enum FrontendLocation {}

export enum FRONTEND_FUNCTION {
  GET_ROUTES = 'GET_ROUTES',
  GET_SIDEBAR_ITEMS = 'GET_SIDEBAR_ITEMS',
  GET_SIDEBAR_GROUPS = 'GET_SIDEBAR_GROUPS',
  GET_SLOT_CONTRIBUTIONS = 'GET_SLOT_CONTRIBUTIONS',
}

// A navigation entry a plugin contributes to the app sidebar. The host renders
// `label` with `icon` and links to `path` (which should match a route the
// plugin returns from getRoutes()). Route-level `authRequired` still gates
// visibility, so an entry never points at a page the user cannot open.
export interface PluginSidebarItem {
  label: string;
  path: string;
  icon?: ReactNode;
  /** Host or plugin-declared group ID. Omitted or unknown groups render at the root. */
  group?: string;
}

/** A group declared by a plugin. Matching IDs share one group; empty groups are hidden. */
export interface PluginSidebarGroup {
  /** Stable, nonempty ID. Use a plugin prefix for private groups or an agreed ID for shared groups. */
  id: string;
  label: string;
  icon?: ReactNode;
}

/** Tile sizes, as on a phone home screen: small is 1×1 grid cells, medium 2×1, large 2×2. */
export type DashboardWidgetSize = 'small' | 'medium' | 'large';

export interface DashboardWidgetRenderProps {
  /** The size of the tile the body fills. Show a fixed amount of content per size; the tile never grows. */
  size: DashboardWidgetSize;
  /**
   * True in the "Add widget" gallery. The preview is inert: do not open dialogs, navigate or start anything from it.
   */
  isPreview: boolean;
}

/**
 * A widget a plugin offers for the user's dashboard. The host renders the card around it (icon, title, the edit
 * controls and an error boundary); `render()` returns only the card body. The `id` must be listed in the plugin
 * manifest's `dashboardWidgets`, and a built-in widget with the same id always wins.
 */
export interface PluginDashboardWidget {
  /** Stable, lowercase kebab-case id, e.g. `reservations-upcoming`. It is stored in users' dashboards. */
  id: string;
  title: string;
  /** One line shown in the "Add widget" gallery. */
  description: string;
  icon?: ReactNode;
  /** The page the widget's header links to outside edit mode, e.g. `/reservations`. */
  href?: string;
  /** The sizes the widget supports. Defaults to `['medium']`. */
  sizes?: DashboardWidgetSize[];
  /** The size a new tile gets. Defaults to the first entry of `sizes`. */
  defaultSize?: DashboardWidgetSize;
  /**
   * The gallery group the widget appears in. Without one it joins the plugin's own group, which is titled after the
   * first group a widget of the plugin names, else after the plugin's manifest name.
   */
  group?: string;
  /** Extra search terms for the gallery, besides title, description and group. */
  keywords?: string[];
  /**
   * Set when the body holds form fields. Fields disappear on a card surface, so the host then renders the widget on
   * an outlined section instead.
   */
  hasFields?: boolean;
  /** Renders the body. Widgets written before sizes existed take no argument and render at their default size. */
  render(props?: DashboardWidgetRenderProps): ReactNode;
}

export const getPluginFunctionName = (pluginName: string, func: FRONTEND_FUNCTION) => {
  return `${pluginName}.${func}`;
};

export interface AttraccessFrontendPluginAuthData {
  authToken: string;
  user: User;
}

export interface AttraccessFrontendPlugin extends IPlugin {
  onApiAuthStateChange(authData: null | AttraccessFrontendPluginAuthData): void;
  onApiEndpointChange(endpoint: string): void;
  // Optional. Return the routes this plugin contributes to the app router.
  getRoutes?(): RouteConfig[];
  // Optional. Return the sidebar navigation entries this plugin contributes.
  getSidebarItems?(): PluginSidebarItem[];
  // Optional. Subscribe to changes of this plugin's sidebar entries (e.g. after an async permission check);
  // the host then calls getSidebarItems() again. Returns the unsubscribe function.
  onSidebarItemsChange?(listener: () => void): () => void;
  // Optional. Declare groups your entries need, including shared groups.
  // Each plugin can declare the same shared ID to work independently.
  // Host groups take precedence; the first plugin declaration wins duplicate IDs.
  getSidebarGroups?(): PluginSidebarGroup[];
  // Optional. Return the contributions this plugin renders into host slots
  // (generic embedded extension points). See frontend.slots.ts.
  getSlotContributions?(): PluginSlotContribution[];
  // Optional. Return the dashboard widgets the current user may use. Only ids listed in the manifest's
  // `dashboardWidgets` are offered; a widget a user pinned and no longer gets shows as "no longer accessible".
  getDashboardWidgets?(): PluginDashboardWidget[];
  // Optional. Subscribe to changes of this plugin's dashboard widgets (e.g. after an async permission check);
  // the host then calls getDashboardWidgets() again. Returns the unsubscribe function.
  onDashboardWidgetsChange?(listener: () => void): () => void;
}
