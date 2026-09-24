// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardLanding, DashboardPage } from './index';

const { getPins, updatePins } = vi.hoisted(() => ({ getPins: vi.fn(), updatePins: vi.fn() }));
vi.mock('@attraccess/react-query-client', () => ({ DashboardService: { dashboardGetPins: getPins, dashboardUpdatePins: updatePins }, useLicenseServiceGetLicenseInformation: () => ({ isLoading: false }) }));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: ({ en }: { en: Record<string, unknown> }) => ({ t: (key: string) => key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], en) ?? key }),
}));
vi.mock('../routes', () => ({ useAllRoutes: () => ['/projects', '/messages', '/devices/companion'].map((path) => ({ path, authRequired: true })) }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('../layout/sidebarItems', async (importOriginal) => {
  const original = await importOriginal<typeof import('../layout/sidebarItems')>();
  return { ...original, useSidebarItems: () => original.SIDEBAR_ITEMS, buildSidebarEndItems: () => [] };
});
vi.mock('../plugins/plugin.state', () => ({ default: () => ({ plugins: [] }) }));

const page = (itemId: string) => ({ itemType: 'page', itemId });
function mount(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>);
}

describe('Dashboard', () => {
  beforeEach(() => { getPins.mockReset(); updatePins.mockReset(); });

  it('uses sidebar labels for default and grouped page pins', async () => {
    getPins.mockResolvedValue([page('/projects'), page('/devices/companion')]);
    mount(<DashboardPage />);
    expect(await screen.findByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Companion App' })).toBeInTheDocument();
  });

  it('falls back to resources when the only pin cannot be resolved, but lets users remove it on the dashboard', async () => {
    getPins.mockResolvedValue([page('/uninstalled-plugin')]);
    mount(<Routes><Route path="/" element={<DashboardLanding />} /><Route path="/resources" element={<span>Resources landing</span>} /></Routes>);
    expect(await screen.findByText('Resources landing')).toBeInTheDocument();
    mount(<DashboardPage />);
    expect(await screen.findByRole('button', { name: 'Unpin /uninstalled-plugin' })).toBeInTheDocument();
  });

  it('does not send a second full-list update while removal is pending', async () => {
    getPins.mockResolvedValue([page('/projects'), page('/messages')]);
    let finish!: (items: unknown[]) => void;
    updatePins.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    mount(<DashboardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Unpin Projects' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unpin Messages' }));
    await waitFor(() => expect(updatePins).toHaveBeenCalledTimes(1));
    expect(updatePins).toHaveBeenCalledWith({ requestBody: { items: [page('/messages')] } });
    finish([page('/messages')]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unpin Messages' })).toBeEnabled());
  });
});
