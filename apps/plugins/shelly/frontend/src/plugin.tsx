// Shelly management plugin — frontend half.
//
// A module-federation remote that registers the device-registry page and a
// sidebar entry. Access is gated behind `resources.update`.
import { WifiIcon } from 'lucide-react';
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  PluginSidebarItem,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';
import { DevicesPage } from './DevicesPage';

export default class ShellyPlugin implements AttraccessFrontendPlugin {
  getPluginName(): string {
    return 'shelly-plugin@0.1.0';
  }

  getDependencies(): string[] {
    return [];
  }

  init(_store: IPluginStore): void {
    // No setup needed.
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
    return [{ path: '/shelly', authRequired: 'resources.update', element: <DevicesPage /> }];
  }

  getSidebarItems(): PluginSidebarItem[] {
    return [
      {
        label: 'Shelly',
        path: '/shelly',
        icon: <WifiIcon className="w-5 h-5" />,
      },
    ];
  }
}
