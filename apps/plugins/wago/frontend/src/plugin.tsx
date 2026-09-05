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
import { RESOURCE_OVERVIEW_SLOT, RESOURCE_ACTIVE_SESSION_SLOT, RESOURCE_LIST_ROW_SLOT, type PluginSlotContribution, type ResourceSlotContext } from '@attraccess/plugins-frontend-sdk';
import { ResourceDiagnostics } from './ResourceDiagnostics';

export default class WagoPlugin implements AttraccessFrontendPlugin {
  private diagnosticsAllowed = false;
  private readonly authListeners = new Set<() => void>();
  private readonly diagnosticsAccess = {
    getSnapshot: () => this.diagnosticsAllowed,
    subscribe: (listener: () => void) => {
      this.authListeners.add(listener);
      return () => { this.authListeners.delete(listener); };
    },
  };

  getSlotContributions(): PluginSlotContribution[] {
    return [RESOURCE_OVERVIEW_SLOT, RESOURCE_ACTIVE_SESSION_SLOT, RESOURCE_LIST_ROW_SLOT].map((slotId): PluginSlotContribution<ResourceSlotContext> => ({
      slotId,
      key: `wago-${slotId}`,
      render: ({ resourceId }) => <ResourceDiagnostics resourceId={resourceId} compact={slotId === RESOURCE_LIST_ROW_SLOT} access={this.diagnosticsAccess} />,
    }));
  }
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
    const user = authData?.user as { effectivePermissions?: string[] } | null | undefined;
    this.diagnosticsAllowed = user?.effectivePermissions?.includes('resources.update') ?? false;
    this.authListeners.forEach((listener) => listener());
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
