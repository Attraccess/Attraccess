import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttraccessFrontendPlugin, PluginSidebarGroup, PluginSidebarItem } from '@attraccess/plugins-frontend-sdk';
import { PlugIcon } from 'lucide-react';
import { Providers } from '@attraccess/ui';
import { Sidebar } from './sidebar';

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
  it('places WAGO only inside Devices even when no built-in device entries are visible', async () => {
    const user = userEvent.setup();
    renderSidebar();

    expect(screen.queryByRole('link', { name: 'WAGO' })).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Devices' });
    await user.click(trigger);

    const devices = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
    expect(devices).not.toBeNull();
    if (!devices) throw new Error('Devices panel is missing');
    expect(within(devices).getByRole('link', { name: 'WAGO' })).toHaveAttribute('href', '/wago');
    expect(screen.getAllByRole('link', { name: 'WAGO' })).toHaveLength(1);
  });

  it('includes WAGO in the collapsed Devices menu', async () => {
    const user = userEvent.setup();
    renderSidebar(true);

    expect(screen.queryByTitle('WAGO')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Devices' }));

    expect(within(screen.getByRole('menu', { name: 'Devices' })).getByRole('menuitem', { name: 'WAGO' })).toBeVisible();
  });

  it('hides WAGO and the empty Devices group without the route permission', () => {
    state.canManageWago = false;
    renderSidebar();

    expect(screen.queryByRole('button', { name: 'Devices' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'WAGO' })).not.toBeInTheDocument();
  });

  it('keeps entries with omitted or unknown groups at the root', () => {
    state.items = [
      { label: 'Existing plugin', path: '/existing' },
      { label: 'Unknown group', path: '/unknown', group: 'unavailable' },
    ];
    renderSidebar();

    expect(screen.getByRole('link', { name: 'Existing plugin' })).toHaveAttribute('href', '/existing');
    expect(screen.getByRole('link', { name: 'Unknown group' })).toHaveAttribute('href', '/unknown');
  });

  it('renders plugin-declared labels and icons and places entries inside the new group', async () => {
    state.groups = [{ id: 'wago-tools', label: 'WAGO Tools', icon: <PlugIcon data-testid="plugin-group-icon" /> }];
    state.items[0].group = 'wago-tools';
    const user = userEvent.setup();
    renderSidebar();

    const trigger = screen.getByRole('button', { name: 'WAGO Tools' });
    expect(within(trigger).getByTestId('plugin-group-icon')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'WAGO' })).not.toBeInTheDocument();
    await user.click(trigger);

    const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
    if (!panel) throw new Error('Plugin group panel is missing');
    expect(within(panel).getByRole('link', { name: 'WAGO' })).toHaveAttribute('href', '/wago');
  });

  it('opens a plugin-declared group in the collapsed sidebar and navigates to its entry', async () => {
    state.groups = [{ id: 'wago-tools', label: 'WAGO Tools' }];
    state.items[0].group = 'wago-tools';
    const user = userEvent.setup();
    renderSidebar(true);

    await user.click(screen.getByRole('button', { name: 'WAGO Tools' }));
    const menu = screen.getByRole('menu', { name: 'WAGO Tools' });
    await user.click(within(menu).getByRole('menuitem', { name: 'WAGO' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/wago');
  });

  it('hides unused custom groups and groups whose entries fail permission checks', () => {
    state.groups = [
      { id: 'wago-tools', label: 'WAGO Tools' },
      { id: 'unused', label: 'Unused group' },
    ];
    state.items[0].group = 'wago-tools';
    state.canManageWago = false;
    renderSidebar();

    expect(screen.queryByRole('button', { name: 'WAGO Tools' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unused group' })).not.toBeInTheDocument();
  });

  it.each([
    { providerFirst: true, collapsed: false },
    { providerFirst: false, collapsed: false },
    { providerFirst: true, collapsed: true },
    { providerFirst: false, collapsed: true },
  ])(
    'shares a group across plugins (provider first: $providerFirst, collapsed: $collapsed)',
    async ({ providerFirst, collapsed }) => {
      const provider = {
        plugin: {
          getPluginName: () => '3d-printer',
          getSidebarGroups: () => [{ id: '3d-printer', label: '3D Printers' }],
        },
      };
      const consumer = {
        plugin: {
          getPluginName: () => 'bambulab',
          getSidebarItems: () => [{ label: 'BambuLab', path: '/printers/bambulab', group: '3d-printer' }],
        },
      };
      state.plugins = providerFirst ? [provider, consumer] : [consumer, provider];
      const user = userEvent.setup();
      renderSidebar(collapsed);

      expect(screen.queryByRole('link', { name: 'BambuLab' })).not.toBeInTheDocument();
      const trigger = screen.getByRole('button', { name: '3D Printers' });
      await user.click(trigger);

      if (collapsed) {
        const menu = screen.getByRole('menu', { name: '3D Printers' });
        await user.click(within(menu).getByRole('menuitem', { name: 'BambuLab' }));
        expect(screen.getByLabelText('Current path')).toHaveTextContent('/printers/bambulab');
      } else {
        const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
        if (!panel) throw new Error('Shared plugin group panel is missing');
        expect(within(panel).getByRole('link', { name: 'BambuLab' })).toHaveAttribute('href', '/printers/bambulab');
      }
    },
  );

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
      state.plugins = standalone
        ? [bambulab]
        : configuration === '3D printer first'
          ? [printer, bambulab]
          : [bambulab, printer];
      const user = userEvent.setup();
      renderSidebar(collapsed);

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

  it('keeps host metadata and uses only the first declaration for duplicate custom IDs', async () => {
    state.groups = [
      { id: 'devices', label: 'Replacement devices' },
      { id: 'wago-tools', label: 'WAGO Tools' },
      { id: 'wago-tools', label: 'Duplicate tools' },
    ];
    state.items.push({ label: 'Tools', path: '/tools', group: 'wago-tools' });
    const user = userEvent.setup();
    renderSidebar();

    expect(screen.getByRole('button', { name: 'Devices' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replacement devices' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate tools' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'WAGO Tools' }));
    expect(screen.getByRole('link', { name: 'Tools' })).toHaveAttribute('href', '/tools');
  });

  it('preserves navigation when a plugin throws while declaring groups', () => {
    state.throwGroups = true;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      renderSidebar();

      expect(screen.getByRole('button', { name: 'Devices' })).toBeInTheDocument();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('getSidebarGroups()'), expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });
});
