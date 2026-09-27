// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardLanding, DashboardPage } from './index';
import usePluginState from '../plugins/plugin.state';

const { getPins, updatePins, hasPermission, getResource } = vi.hoisted(() => ({ getPins: vi.fn(), updatePins: vi.fn(), hasPermission: vi.fn(), getResource: vi.fn() }));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  DashboardService: { dashboardGetPins: getPins, dashboardUpdatePins: updatePins },
  useResourcesServiceGetOneResourceById: getResource,
  useLicenseServiceGetLicenseInformation: () => ({ isLoading: false }),
}));
vi.mock('../resources/usage/resourceUsageSession', () => ({ ResourceUsageSession: ({ resourceId }: { resourceId: number }) => <div>Session controls {resourceId}</div> }));
vi.mock('../resourceOverview/resourceGroupCard/statusChip', () => ({ StatusChip: ({ resourceId }: { resourceId: number }) => <div>Status {resourceId}</div> }));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: ({ en }: { en: Record<string, unknown> }) => ({
    t: (key: string) =>
      key.replace('##default##', '__default__').split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part === '__default__' ? '##default##' : part], en) ?? key,
  }),
}));
vi.mock('../routes', () => ({
  useAllRoutes: () => {
    const plugins = usePluginState((state) => state.plugins);
    return [
      ...['/projects', '/messages', '/devices/companion', '/printables'].map((path) => ({ path, authRequired: true })),
      { path: '/users', authRequired: 'users.read' },
      ...plugins.flatMap((manifest) => manifest.plugin.getRoutes?.() ?? []),
    ];
  },
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission, user: { id: 7 } }) }));
vi.mock('../layout/sidebarItems', async (importOriginal) => {
  const original = await importOriginal<typeof import('../layout/sidebarItems')>();
  return { ...original, useSidebarItems: () => original.SIDEBAR_ITEMS, buildSidebarEndItems: () => original.buildSidebarEndItems('', '') };
});
const page = (itemId: string) => ({ itemType: 'page', itemId });
function mount(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['UsersServiceGetCurrent'], { id: 7 });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter>{element}</MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe('Dashboard', () => {
  beforeEach(() => {
    getPins.mockReset();
    updatePins.mockReset();
    getResource.mockReset().mockReturnValue({ data: { id: 7, name: 'Printer' } });
    hasPermission.mockReset().mockReturnValue(true);
    usePluginState.setState({ plugins: [], isInitialized: true });
  });

  it('uses sidebar labels for default, grouped and end-group page pins', async () => {
    getPins.mockResolvedValue([page('/projects'), page('/devices/companion'), page('/printables')]);
    mount(<DashboardPage />);
    expect(await screen.findByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Companion App' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '3D Models' })).toBeInTheDocument();
  });

  it('keeps the dashboard as the landing for an unresolved persisted pin and hides its card', async () => {
    getPins.mockResolvedValue([page('/uninstalled-plugin')]);
    mount(
      <Routes>
        <Route path="/" element={<DashboardLanding />} />
        <Route path="/resources" element={<span>Resources landing</span>} />
      </Routes>,
    );
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText('Resources landing')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unpin /uninstalled-plugin' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No available shortcuts' })).toBeInTheDocument();
  });

  it('keeps the dashboard for a revoked permission pin while hiding its card', async () => {
    hasPermission.mockReturnValue(false);
    getPins.mockResolvedValue([page('/users')]);
    mount(
      <Routes>
        <Route path="/" element={<DashboardLanding />} />
        <Route path="/resources" element={<span>Resources landing</span>} />
      </Routes>,
    );
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText('Resources landing')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(hasPermission).toHaveBeenCalledWith('users.read');
  });

  it('lands on the dashboard when another pinned page is accessible despite a revoked permission', async () => {
    hasPermission.mockReturnValue(false);
    getPins.mockResolvedValue([page('/users'), page('/projects')]);
    mount(
      <Routes>
        <Route path="/" element={<DashboardLanding />} />
        <Route path="/resources" element={<span>Resources landing</span>} />
      </Routes>,
    );
    expect(await screen.findByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(screen.queryByText('Resources landing')).not.toBeInTheDocument();
  });

  it('renders resource status and session controls with the pinned resource name', async () => {
    getPins.mockResolvedValue([{ itemType: 'resource', itemId: '7', resourceName: 'Printer' }]);
    mount(<DashboardPage />);
    expect(await screen.findByRole('heading', { name: 'Printer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open resource' })).toHaveAttribute('href', '/resources/7');
    expect(screen.getByText('Status 7')).toBeInTheDocument();
    expect(screen.getByText('Session controls 7')).toBeInTheDocument();
  });

  it('falls back for empty pins without waiting for plugin discovery', async () => {
    usePluginState.setState({ isInitialized: false });
    getPins.mockResolvedValue([]);
    mount(
      <Routes>
        <Route path="/" element={<DashboardLanding />} />
        <Route path="/resources" element={<span>Resources landing</span>} />
      </Routes>,
    );
    expect(await screen.findByText('Resources landing')).toBeInTheDocument();
  });

  it('shows pin loading errors without waiting for plugin discovery', async () => {
    usePluginState.setState({ isInitialized: false });
    getPins.mockRejectedValue(new Error('Could not fetch pins'));
    mount(<DashboardLanding />);
    expect(await screen.findByText('Could not load your dashboard.')).toBeInTheDocument();
  });

  it.each([
    ['resource', [{ itemType: 'resource', itemId: '1' }]],
    ['core page', [page('/projects'), page('/plugin-report')]],
  ])('shows the dashboard for a resolved %s pin while plugins are pending', async (_kind, pins) => {
    usePluginState.setState({ isInitialized: false });
    getPins.mockResolvedValue(pins);
    mount(
      <Routes>
        <Route path="/" element={<DashboardLanding />} />
        <Route path="/resources" element={<span>Resources landing</span>} />
      </Routes>,
    );
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText('Resources landing')).not.toBeInTheDocument();
  });

  it('waits for plugin discovery before deciding a plugin-only pin is unavailable', async () => {
    usePluginState.setState({ isInitialized: false });
    getPins.mockResolvedValue([page('/plugin-report')]);
    const { client } = mount(
      <Routes>
        <Route path="/" element={<DashboardLanding />} />
        <Route path="/resources" element={<span>Resources landing</span>} />
      </Routes>,
    );

    await waitFor(() => expect(client.getQueryData(['dashboard', 'pins', 7])).toEqual([page('/plugin-report')]));
    expect(screen.queryByText('Resources landing')).not.toBeInTheDocument();

    usePluginState.setState({
      plugins: [
        {
          plugin: {
            getSidebarItems: () => [{ path: '/plugin-report', label: 'Plugin report', icon: <span data-testid="plugin-page-icon">Plugin icon</span> }],
            getRoutes: () => [{ path: '/plugin-report', authRequired: true }],
          },
        } as never,
      ],
      isInitialized: true,
    });

    expect(await screen.findByRole('link', { name: 'Plugin report' })).toBeInTheDocument();
    expect(screen.getByTestId('plugin-page-icon')).toBeInTheDocument();
    expect(screen.queryByText('Resources landing')).not.toBeInTheDocument();
  });

  it('shows a permitted plugin page whose path starts with the kiosk prefix', async () => {
    usePluginState.setState({
      plugins: [{
        plugin: {
          getSidebarItems: () => [{ path: '/kiosk-guide', label: 'Kiosk guide' }],
          getRoutes: () => [{ path: '/kiosk-guide', authRequired: true }],
        },
      } as never],
      isInitialized: true,
    });
    getPins.mockResolvedValue([page('/kiosk-guide')]);

    mount(<DashboardPage />);

    expect(await screen.findByRole('link', { name: 'Kiosk guide' })).toHaveAttribute('href', '/kiosk-guide');
  });

  it('keeps landing on the dashboard after plugin discovery cannot resolve a persisted pin', async () => {
    usePluginState.setState({ isInitialized: false });
    getPins.mockResolvedValue([page('/uninstalled-plugin')]);
    const { client } = mount(
      <Routes>
        <Route path="/" element={<DashboardLanding />} />
        <Route path="/resources" element={<span>Resources landing</span>} />
      </Routes>,
    );

    await waitFor(() => expect(client.getQueryData(['dashboard', 'pins', 7])).toEqual([page('/uninstalled-plugin')]));
    expect(screen.queryByText('Resources landing')).not.toBeInTheDocument();
    usePluginState.setState({ isInitialized: true });
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText('Resources landing')).not.toBeInTheDocument();
  });

  it('sends individual removal operations without replacing other pins', async () => {
    getPins.mockResolvedValue([page('/projects'), page('/messages')]);
    let finish!: (items: unknown[]) => void;
    updatePins.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount(<DashboardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Unpin Projects' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unpin Messages' }));
    await waitFor(() => expect(updatePins).toHaveBeenCalledTimes(1));
    expect(updatePins).toHaveBeenCalledWith({ requestBody: { kind: 'remove', item: page('/projects') } });
    finish([page('/messages')]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unpin Messages' })).toBeEnabled());
  });
});
