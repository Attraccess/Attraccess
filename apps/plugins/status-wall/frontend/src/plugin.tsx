// Status Wall plugin — frontend half.
//
// A management page for status walls, and the public full-screen display a big screen opens from a wall's link
// (no sign-in, no app shell).
import './styles.css';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  PluginSidebarItem,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import { MonitorIcon } from 'lucide-react';
import type { PluginStore } from 'react-pluggable';
import { STATUS_WALL_MANAGE } from '../../backend/permission-keys';
import { WallsPage } from './admin/WallsPage';
import { WallDisplayPage } from './display/WallDisplayPage';
import de from './de.json';
import en from './en.json';

const labels = () => (useTranslationState.getState().language === 'de' ? de : en);

export default class StatusWallPlugin implements AttraccessFrontendPlugin {
  pluginStore!: PluginStore;

  getPluginName(): string {
    return 'status-wall-plugin@0.1.1';
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
    // The display needs no account; the management route is gated by the host.
  }

  onApiEndpointChange(_endpoint: string): void {
    // no-op
  }

  getRoutes(): RouteConfig[] {
    return [
      { path: '/status-walls', authRequired: STATUS_WALL_MANAGE, element: <WallsPage /> },
      { path: '/status-wall/:token', authRequired: false, noLayout: true, element: <WallDisplayPage /> },
    ];
  }

  getSidebarItems(): PluginSidebarItem[] {
    return [{ label: labels().sidebar, path: '/status-walls', icon: <MonitorIcon className="sw:h-5 sw:w-5" /> }];
  }
}
