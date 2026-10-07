import { screen } from '@testing-library/react';
import { expect } from 'vitest';
import { it } from 'vitest';
import type { PluginSidebarPlacementTestScope } from './sidebar.test';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { PlugIcon } from 'lucide-react';

export function registerHidesUnusedCustomGroupsAndGroupsWhoseEntriesFailPermissionChecks(
  scope: PluginSidebarPlacementTestScope,
): void {
  it('hides unused custom groups and groups whose entries fail permission checks', () => {
    scope.state.groups = [
      { id: 'wago-tools', label: 'WAGO Tools' },
      { id: 'unused', label: 'Unused group' },
    ];
    scope.state.items[0].group = 'wago-tools';
    scope.state.canManageWago = false;
    scope.renderSidebar();

    expect(screen.queryByRole('button', { name: 'WAGO Tools' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unused group' })).not.toBeInTheDocument();
  });
}

export function registerHidesWagoAndTheEmptyDevicesGroupWithoutTheRoutePermission(
  scope: PluginSidebarPlacementTestScope,
): void {
  it('hides WAGO and the empty Devices group without the route permission', () => {
    scope.state.canManageWago = false;
    scope.renderSidebar();

    expect(screen.queryByRole('button', { name: 'Devices' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'WAGO' })).not.toBeInTheDocument();
  });
}

export function registerIncludesWagoInTheCollapsedDevicesMenu(scope: PluginSidebarPlacementTestScope): void {
  it('includes WAGO in the collapsed Devices menu', async () => {
    const user = userEvent.setup();
    scope.renderSidebar(true);

    expect(screen.queryByTitle('WAGO')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Devices' }));

    expect(within(screen.getByRole('menu', { name: 'Devices' })).getByRole('menuitem', { name: 'WAGO' })).toBeVisible();
  });
}

export function registerKeepsAnIndependentlyDeclaredSharedGroupConfigurationCollapsedCollapsed(
  scope: PluginSidebarPlacementTestScope,
): void {
  it.each([
    { configuration: 'BambuLab only', collapsed: false },
    { configuration: 'BambuLab only', collapsed: true },
    { configuration: '3D printer first', collapsed: false },
    { configuration: '3D printer first', collapsed: true },
    { configuration: 'BambuLab first', collapsed: false },
    { configuration: 'BambuLab first', collapsed: true },
  ])(
    'keeps an independently declared shared group ($configuration, collapsed: $collapsed)',
    async ({ configuration, collapsed }) => {
      const printer = {
        plugin: {
          getPluginName: () => '3d-printer',
          getSidebarGroups: () => [{ id: '3d-printer', label: '3D Printers' }],
          getSidebarItems: () => [{ label: 'All printers', path: '/printers', group: '3d-printer' }],
        },
      };
      const bambulab = {
        plugin: {
          getPluginName: () => 'bambulab',
          getSidebarGroups: () => [{ id: '3d-printer', label: '3D Printers' }],
          getSidebarItems: () => [{ label: 'BambuLab', path: '/printers/bambulab', group: '3d-printer' }],
        },
      };
      const standalone = configuration === 'BambuLab only';
      scope.state.plugins = standalone
        ? [bambulab]
        : configuration === '3D printer first'
          ? [printer, bambulab]
          : [bambulab, printer];
      const user = userEvent.setup();
      scope.renderSidebar(collapsed);

      expect(screen.getAllByRole('button', { name: '3D Printers' })).toHaveLength(1);
      expect(screen.queryByRole('link', { name: 'BambuLab' })).not.toBeInTheDocument();
      const trigger = screen.getByRole('button', { name: '3D Printers' });
      await user.click(trigger);

      const panel = collapsed
        ? screen.getByRole('menu', { name: '3D Printers' })
        : document.getElementById(trigger.getAttribute('aria-controls') ?? '');
      if (!panel) throw new Error('Shared printer group is missing');
      const role = collapsed ? 'menuitem' : 'link';
      expect(within(panel).getAllByRole(role)).toHaveLength(standalone ? 1 : 2);
      if (!standalone) expect(within(panel).getByRole(role, { name: 'All printers' })).toBeVisible();

      const entry = within(panel).getByRole(role, { name: 'BambuLab' });
      if (collapsed) {
        await user.click(entry);
        expect(screen.getByLabelText('Current path')).toHaveTextContent('/printers/bambulab');
      } else {
        expect(entry).toHaveAttribute('href', '/printers/bambulab');
      }
    },
  );
}

export function registerKeepsEntriesWithOmittedOrUnknownGroupsAtTheRoot(scope: PluginSidebarPlacementTestScope): void {
  it('keeps entries with omitted or unknown groups at the root', () => {
    scope.state.items = [
      { label: 'Existing plugin', path: '/existing' },
      { label: 'Unknown group', path: '/unknown', group: 'unavailable' },
    ];
    scope.renderSidebar();

    expect(screen.getByRole('link', { name: 'Existing plugin' })).toHaveAttribute('href', '/existing');
    expect(screen.getByRole('link', { name: 'Unknown group' })).toHaveAttribute('href', '/unknown');
  });
}

export function registerKeepsHostMetadataAndUsesOnlyTheFirstDeclarationForDuplicateCustomIds(
  scope: PluginSidebarPlacementTestScope,
): void {
  it('keeps host metadata and uses only the first declaration for duplicate custom IDs', async () => {
    scope.state.groups = [
      { id: 'devices', label: 'Replacement devices' },
      { id: 'wago-tools', label: 'WAGO Tools' },
      { id: 'wago-tools', label: 'Duplicate tools' },
    ];
    scope.state.items.push({ label: 'Tools', path: '/tools', group: 'wago-tools' });
    const user = userEvent.setup();
    scope.renderSidebar();

    expect(screen.getByRole('button', { name: 'Devices' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replacement devices' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate tools' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'WAGO Tools' }));
    expect(screen.getByRole('link', { name: 'Tools' })).toHaveAttribute('href', '/tools');
  });
}

export function registerOpensAPluginDeclaredGroupInTheCollapsedSidebarAndNavigatesToItsEntry(
  scope: PluginSidebarPlacementTestScope,
): void {
  it('opens a plugin-declared group in the collapsed sidebar and navigates to its entry', async () => {
    scope.state.groups = [{ id: 'wago-tools', label: 'WAGO Tools' }];
    scope.state.items[0].group = 'wago-tools';
    const user = userEvent.setup();
    scope.renderSidebar(true);

    await user.click(screen.getByRole('button', { name: 'WAGO Tools' }));
    const menu = screen.getByRole('menu', { name: 'WAGO Tools' });
    await user.click(within(menu).getByRole('menuitem', { name: 'WAGO' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/wago');
  });
}

export function registerPlacesWagoOnlyInsideDevicesEvenWhenNoBuiltInDeviceEntriesAreVisible(
  scope: PluginSidebarPlacementTestScope,
): void {
  it('places WAGO only inside Devices even when no built-in device entries are visible', async () => {
    const user = userEvent.setup();
    scope.renderSidebar();

    expect(screen.queryByRole('link', { name: 'WAGO' })).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Devices' });
    await user.click(trigger);

    const devices = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
    expect(devices).not.toBeNull();
    if (!devices) throw new Error('Devices panel is missing');
    expect(within(devices).getByRole('link', { name: 'WAGO' })).toHaveAttribute('href', '/wago');
    expect(screen.getAllByRole('link', { name: 'WAGO' })).toHaveLength(1);
  });
}

export function registerPreservesNavigationWhenAPluginThrowsWhileDeclaringGroups(
  scope: PluginSidebarPlacementTestScope,
): void {
  it('preserves navigation when a plugin throws while declaring groups', () => {
    scope.state.throwGroups = true;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      scope.renderSidebar();

      expect(screen.getByRole('button', { name: 'Devices' })).toBeInTheDocument();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('getSidebarGroups()'), expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });
}

export function registerRendersPluginDeclaredLabelsAndIconsAndPlacesEntriesInsideTheNewGroup(
  scope: PluginSidebarPlacementTestScope,
): void {
  it('renders plugin-declared labels and icons and places entries inside the new group', async () => {
    scope.state.groups = [
      { id: 'wago-tools', label: 'WAGO Tools', icon: <PlugIcon data-testid="plugin-group-icon" /> },
    ];
    scope.state.items[0].group = 'wago-tools';
    const user = userEvent.setup();
    scope.renderSidebar();

    const trigger = screen.getByRole('button', { name: 'WAGO Tools' });
    expect(within(trigger).getByTestId('plugin-group-icon')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'WAGO' })).not.toBeInTheDocument();
    await user.click(trigger);

    const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
    if (!panel) throw new Error('Plugin group panel is missing');
    expect(within(panel).getByRole('link', { name: 'WAGO' })).toHaveAttribute('href', '/wago');
  });
}
