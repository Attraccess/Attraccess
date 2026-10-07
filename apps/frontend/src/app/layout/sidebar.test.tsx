import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, vi } from 'vitest';
import type { AttraccessFrontendPlugin, PluginSidebarGroup, PluginSidebarItem } from '@attraccess/plugins-frontend-sdk';
import { Providers } from '@attraccess/ui';
import { Sidebar } from './sidebar';
import { registerPlacesWagoOnlyInsideDevicesEvenWhenNoBuiltInDeviceEntriesAreVisible } from './sidebar.test-cases';
import { registerIncludesWagoInTheCollapsedDevicesMenu } from './sidebar.test-cases';
import { registerHidesWagoAndTheEmptyDevicesGroupWithoutTheRoutePermission } from './sidebar.test-cases';
import { registerKeepsEntriesWithOmittedOrUnknownGroupsAtTheRoot } from './sidebar.test-cases';
import { registerRendersPluginDeclaredLabelsAndIconsAndPlacesEntriesInsideTheNewGroup } from './sidebar.test-cases';
import { registerOpensAPluginDeclaredGroupInTheCollapsedSidebarAndNavigatesToItsEntry } from './sidebar.test-cases';
import { registerHidesUnusedCustomGroupsAndGroupsWhoseEntriesFailPermissionChecks } from './sidebar.test-cases';
import { registerSharesAGroupAcrossPluginsProviderFirstProviderFirstCollapsedCollapsed } from './sidebar.shares-a-group-across-plugins-provider-first-provider-first-collapsed-collapsed.test-cases';
import { registerKeepsAnIndependentlyDeclaredSharedGroupConfigurationCollapsedCollapsed } from './sidebar.test-cases';
import { registerKeepsHostMetadataAndUsesOnlyTheFirstDeclarationForDuplicateCustomIds } from './sidebar.test-cases';
import { registerPreservesNavigationWhenAPluginThrowsWhileDeclaringGroups } from './sidebar.test-cases';

const state = vi.hoisted(() => ({
  items: [] as PluginSidebarItem[],
  groups: [] as PluginSidebarGroup[],
  plugins: null as
    | {
        plugin: Pick<AttraccessFrontendPlugin, 'getPluginName' | 'getSidebarGroups' | 'getSidebarItems'>;
      }[]
    | null,
  throwGroups: false,
  canManageWago: true,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'operator' },
    hasPermission: (permission: string) => permission === 'resources.update' && state.canManageWago,
    logout: vi.fn(),
  }),
}));

vi.mock('../plugins/plugin.state', () => ({
  default: () => ({
    plugins: state.plugins ?? [
      {
        plugin: {
          getPluginName: () => 'test-plugin',
          getSidebarItems: () => state.items,
          getSidebarGroups: () => {
            if (state.throwGroups) throw new Error('Broken group declaration');
            return state.groups;
          },
        },
      },
    ],
  }),
}));

vi.mock('../routes', () => ({
  useAllRoutes: () => [
    { path: '/wago', authRequired: 'resources.update' },
    { path: '/printers', authRequired: true },
    { path: '/printers/bambulab', authRequired: 'resources.update' },
    { path: '/devices/mqtt/servers', authRequired: 'system.settings.manage' },
    { path: '/devices/companion', authRequired: 'system.settings.manage' },
  ],
}));

vi.mock('@attraccess/react-query-client', () => ({
  useLicenseServiceGetLicenseInformation: () => ({ data: { modules: [] } }),
  useMessagingServiceMessagingGetUnreadCount: () => ({ data: { total: 0 } }),
}));

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>;
}

function renderSidebar(isCollapsed = false) {
  return render(
    <MemoryRouter initialEntries={['/resources']}>
      <Providers>
        <Sidebar isOpen toggleSidebar={vi.fn()} isCollapsed={isCollapsed} toggleCollapsed={vi.fn()} />
        <CurrentPath />
      </Providers>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.items = [{ label: 'WAGO', path: '/wago', group: 'devices' }];
  state.groups = [];
  state.plugins = null;
  state.throwGroups = false;
  state.canManageWago = true;
});

afterEach(cleanup);

describe('plugin sidebar placement', () => {
  definePluginSidebarPlacementTests();
});

export function definePluginSidebarPlacementTests() {
  const scope = {
    renderSidebar,
    get state() {
      return state;
    },
  };
  registerPlacesWagoOnlyInsideDevicesEvenWhenNoBuiltInDeviceEntriesAreVisible(scope);

  registerIncludesWagoInTheCollapsedDevicesMenu(scope);

  registerHidesWagoAndTheEmptyDevicesGroupWithoutTheRoutePermission(scope);

  registerKeepsEntriesWithOmittedOrUnknownGroupsAtTheRoot(scope);

  registerRendersPluginDeclaredLabelsAndIconsAndPlacesEntriesInsideTheNewGroup(scope);

  registerOpensAPluginDeclaredGroupInTheCollapsedSidebarAndNavigatesToItsEntry(scope);

  registerHidesUnusedCustomGroupsAndGroupsWhoseEntriesFailPermissionChecks(scope);

  registerSharesAGroupAcrossPluginsProviderFirstProviderFirstCollapsedCollapsed(scope);

  registerKeepsAnIndependentlyDeclaredSharedGroupConfigurationCollapsedCollapsed(scope);

  registerKeepsHostMetadataAndUsesOnlyTheFirstDeclarationForDuplicateCustomIds(scope);

  registerPreservesNavigationWhenAPluginThrowsWhileDeclaringGroups(scope);

  return scope;
}

export type PluginSidebarPlacementTestScope = ReturnType<typeof definePluginSidebarPlacementTests>;
