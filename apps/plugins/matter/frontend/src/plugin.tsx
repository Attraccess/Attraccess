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
import { setMatterAuthData } from './permissions';

export default class MatterPlugin implements AttraccessFrontendPlugin {
  pluginStore!: PluginStore;

  getPluginName(): string {
    return 'matter-plugin@0.5.0';
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
    // Any Matter or Thread read key opens the page; the sidebar entry follows the route.
    return [{ path: '/matter', authRequired: [...MATTER_PAGE_PERMISSIONS], element: <MatterPage /> }];
  }

  getSidebarItems(): PluginSidebarItem[] {
    return [{ label: 'Matter', path: '/matter', group: 'devices', icon: <CableIcon className="mt:w-5 mt:h-5" /> }];
  }
}
