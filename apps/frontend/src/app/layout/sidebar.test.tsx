import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginSidebarItem } from '@attraccess/plugins-frontend-sdk';
import { Providers } from '@attraccess/ui';
import { Sidebar } from './sidebar';

const state = vi.hoisted(() => ({
  items: [] as PluginSidebarItem[],
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
    plugins: [{ plugin: { getSidebarItems: () => state.items } }],
  }),
}));

vi.mock('../routes', () => ({
  useAllRoutes: () => [
    { path: '/wago', authRequired: 'resources.update' },
    { path: '/devices/mqtt/servers', authRequired: 'system.settings.manage' },
    { path: '/devices/companion', authRequired: 'system.settings.manage' },
  ],
}));

vi.mock('@attraccess/react-query-client', () => ({
  useLicenseServiceGetLicenseInformation: () => ({ data: { modules: [] } }),
  useMessagingServiceMessagingGetUnreadCount: () => ({ data: { total: 0 } }),
}));

function renderSidebar(isCollapsed = false) {
  return render(
    <MemoryRouter initialEntries={['/resources']}>
      <Providers>
        <Sidebar isOpen toggleSidebar={vi.fn()} isCollapsed={isCollapsed} toggleCollapsed={vi.fn()} />
      </Providers>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.items = [{ label: 'WAGO', path: '/wago', group: 'devices' }];
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
});
