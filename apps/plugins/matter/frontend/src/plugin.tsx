// Matter plugin — frontend half.
//
// A module-federation remote that registers the Matter page and one sidebar entry in the host's "Devices" group.
import './styles.css';
import { CableIcon } from 'lucide-react';
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  PluginSidebarItem,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { PluginStore } from 'react-pluggable';
import { MATTER_PAGE_PERMISSIONS } from '../../backend/permission-keys';
import { MatterPage } from './MatterPage';
import { MATTER_ROUTE_PATHS } from './matterPaths';
import { setMatterAuthData } from './permissions';

export default class MatterPlugin implements AttraccessFrontendPlugin {
  pluginStore!: PluginStore;

  getPluginName(): string {
    return 'matter-plugin@0.4.0';
  }

  getDependencies(): string[] {
    return [];
  }

  init(store: PluginStore): void {
    this.pluginStore = store;
  }

  activate(): void {
    // Called when the plugin is installed into the store.
  }

  deactivate(): void {
    // Called when the plugin is uninstalled.
  }

  onApiAuthStateChange(authData: null | AttraccessFrontendPluginAuthData): void {
    setMatterAuthData(authData);
  }

  onApiEndpointChange(_endpoint: string): void {
    // no-op
  }

  getRoutes(): RouteConfig[] {
    // Any Matter or Thread read key opens the page; each tab then checks its own permission inside MatterPage. The host
    // router takes flat routes, so every subpage is one route that renders the same layout (`/matter` redirects to the
    // first tab the user may see). The sidebar entry stays highlighted on all of them (`dashboardPaths: ["/matter"]`).
    return MATTER_ROUTE_PATHS.map((path) => ({
      path,
      authRequired: [...MATTER_PAGE_PERMISSIONS],
      element: <MatterPage />,
    }));
  }

  getSidebarItems(): PluginSidebarItem[] {
    return [{ label: 'Matter', path: '/matter', group: 'devices', icon: <CableIcon className="mt:w-5 mt:h-5" /> }];
  }
}
