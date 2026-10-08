import './styles.css';
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  PluginSidebarItem,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { PluginStore } from 'react-pluggable';
import { ControllersPage } from './controllers/Page';
import { ConfigurationPage } from './configuration/ConfigurationPage';
import { HistoryPage } from './front-panel/HistoryPage';
import {
  RESOURCE_OVERVIEW_SLOT,
  type PluginSlotContribution,
  type ResourceSlotContext,
} from '@attraccess/plugins-frontend-sdk';
import { ResourceDiagnostics } from './diagnostics/ResourceDiagnostics';
import { WagoLogoIcon } from './shared/WagoLogoIcon';

export default class WagoPlugin implements AttraccessFrontendPlugin {
  pluginStore!: PluginStore;
  private diagnosticsAllowed = false;
  private readonly authListeners = new Set<() => void>();
  private readonly diagnosticsAccess = {
    getSnapshot: () => this.diagnosticsAllowed,
    subscribe: (listener: () => void) => {
      this.authListeners.add(listener);
      return () => {
        this.authListeners.delete(listener);
      };
    },
  };

  getSlotContributions(): PluginSlotContribution[] {
    const contribution: PluginSlotContribution<ResourceSlotContext> = {
      slotId: RESOURCE_OVERVIEW_SLOT,
      key: 'wago-resource-diagnostics',
      render: ({ resourceId }) => <ResourceDiagnostics resourceId={resourceId} access={this.diagnosticsAccess} />,
    };
    return [contribution];
  }
  getPluginName(): string {
    return 'wago-plugin@0.1.0';
  }

  getDependencies(): string[] {
    return [];
  }

  init(store: PluginStore): void {
    this.pluginStore = store;
  }

  activate(): void {
    /* no setup required */
  }

  deactivate(): void {
    /* no teardown required */
  }

  onApiAuthStateChange(authData: null | AttraccessFrontendPluginAuthData): void {
    const user = authData?.user as { effectivePermissions?: string[] } | null | undefined;
    this.diagnosticsAllowed = user?.effectivePermissions?.includes('resources.update') ?? false;
    this.authListeners.forEach((listener) => listener());
  }

  onApiEndpointChange(endpoint: string): void {
    void endpoint;
  }

  getRoutes(): RouteConfig[] {
    return [
      { path: '/wago', authRequired: 'resources.update', element: <ControllersPage /> },
      {
        path: '/wago/controllers/:controllerId/configuration',
        authRequired: 'resources.update',
        element: <ConfigurationPage />,
      },
      {
        path: '/wago/controllers/:controllerId/configuration/history',
        authRequired: 'resources.update',
        element: <HistoryPage />,
      },
    ];
  }

  getSidebarItems(): PluginSidebarItem[] {
    return [{ label: 'WAGO', path: '/wago', group: 'devices', icon: <WagoLogoIcon /> }];
  }
}
