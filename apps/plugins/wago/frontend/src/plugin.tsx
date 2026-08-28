import './styles.css';
import { CpuIcon } from 'lucide-react';
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  PluginSidebarItem,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';
import { ControllersPage } from './ControllersPage';

export default class WagoPlugin implements AttraccessFrontendPlugin {
  getPluginName(): string {
    return 'wago-plugin@0.1.0';
  }
  getDependencies(): string[] {
    return [];
  }
  init(store: IPluginStore): void {
    void store;
  }
  activate(): void {
    /* no setup required */
  }
  deactivate(): void {
    /* no teardown required */
  }
  onApiAuthStateChange(authData: null | AttraccessFrontendPluginAuthData): void {
    void authData;
  }
  onApiEndpointChange(endpoint: string): void {
    void endpoint;
  }
  getRoutes(): RouteConfig[] {
    return [{ path: '/wago', authRequired: 'resources.update', element: <ControllersPage /> }];
  }
  getSidebarItems(): PluginSidebarItem[] {
    return [{ label: 'WAGO', path: '/wago', icon: <CpuIcon className="wg:w-5 wg:h-5" /> }];
  }
}
