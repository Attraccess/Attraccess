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
import { MatterPage } from './MatterPage';

export default class MatterPlugin implements AttraccessFrontendPlugin {
  pluginStore!: PluginStore;

  getPluginName(): string {
    return 'matter-plugin@0.3.0';
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

  onApiAuthStateChange(_authData: null | AttraccessFrontendPluginAuthData): void {
    // no-op
  }

  onApiEndpointChange(_endpoint: string): void {
    // no-op
  }

  getRoutes(): RouteConfig[] {
    // TODO(ATT-1003): replace system.plugins.manage with a dedicated Matter permission
    return [{ path: '/matter', authRequired: 'system.plugins.manage', element: <MatterPage /> }];
  }

  getSidebarItems(): PluginSidebarItem[] {
    return [{ label: 'Matter', path: '/matter', group: 'devices', icon: <CableIcon className="mt:w-5 mt:h-5" /> }];
  }
}
