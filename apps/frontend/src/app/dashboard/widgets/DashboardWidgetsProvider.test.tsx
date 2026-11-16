import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LicenseService } from '@attraccess/react-query-client';
import type { AttraccessFrontendPlugin, PluginDashboardWidget } from '@attraccess/plugins-frontend-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePluginState, { PluginManifestWithPlugin } from '../../plugins/plugin.state';
import { DashboardWidgetsProvider } from './DashboardWidgetsProvider';
import { useDashboardWidgets } from './widgetsContext';

const state = vi.hoisted(() => ({ openable: new Set<string>() }));

vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }) }));
vi.mock('./access', () => ({ useCanOpenPage: () => (path: string) => state.openable.has(path) }));

function Probe() {
  const { widgets, titleOf, isReady } = useDashboardWidgets();
  return (
    <>
      <output aria-label="widgets">{widgets.map((widget) => widget.id).join(',')}</output>
      <output aria-label="ready">{String(isReady)}</output>
      <output aria-label="title">{titleOf('reservations-upcoming') ?? '-'}</output>
    </>
  );
}

function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardWidgetsProvider>
        <Probe />
      </DashboardWidgetsProvider>
    </QueryClientProvider>,
  );
}

const widgetIds = () => screen.getByRole('status', { name: 'widgets' }).textContent?.split(',').filter(Boolean);

function installPlugin(
  widgets: () => PluginDashboardWidget[],
  declared?: string[],
  extra: Partial<AttraccessFrontendPlugin> = {},
) {
  const plugin = { getPluginName: () => 'report-plugin', getDashboardWidgets: widgets, ...extra };
  usePluginState.setState({
    plugins: [
      {
        name: 'report',
        main: { frontend: { directory: 'frontend', entryPoint: 'remoteEntry.js', dashboardWidgets: declared } },
        plugin,
      } as unknown as PluginManifestWithPlugin,
    ],
    isInitialized: true,
  });
}

const reservations: PluginDashboardWidget = {
  id: 'reservations-upcoming',
  title: 'Upcoming reservations',
  description: 'Your next bookings',
  render: () => null,
};

beforeEach(() => {
  state.openable = new Set(['/messages', '/resources']);
  usePluginState.setState({ plugins: [], isInitialized: true });
  vi.spyOn(LicenseService, 'getLicenseInformation').mockResolvedValue({ modules: [] } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DashboardWidgetsProvider', () => {
  it('offers the built-in widgets whose page the user may open', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('true'));
    expect(widgetIds()).toEqual(['messages', 'my-sessions', 'resources']);
  });

  it.each([
    ['/users', 'users'],
    ['/billing', 'billing-balance'],
    ['/attractap/readers', 'readers'],
  ])('offers the widget of %s only to users who may open it', async (path, id) => {
    state.openable.add(path);
    renderProvider();
    await waitFor(() => expect(widgetIds()).toContain(id));
  });

  it('is not ready while the plugins load, even with the license loaded', async () => {
    usePluginState.setState({ isInitialized: false });
    renderProvider();
    await waitFor(() => expect(LicenseService.getLicenseInformation).toHaveBeenCalled());
    // Lets the resolved license reach the query cache.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('false');
    act(() => usePluginState.setState({ isInitialized: true }));
    expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('true');
  });

  it('is not ready while the license loads, even with the plugins loaded', async () => {
    let resolveLicense: (license: unknown) => void = () => undefined;
    vi.spyOn(LicenseService, 'getLicenseInformation').mockReturnValue(
      new Promise((resolve) => (resolveLicense = resolve)) as never,
    );
    renderProvider();
    await waitFor(() => expect(LicenseService.getLicenseInformation).toHaveBeenCalled());
    expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('false');
    await act(async () => resolveLicense({ modules: [] }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('true'));
  });

  it('ignores a plugin whose getDashboardWidgets() returns no array or whose change hook throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    installPlugin(() => 'oops' as never, ['reservations-upcoming'], {
      onDashboardWidgetsChange: () => {
        throw new Error('boom');
      },
    });
    renderProvider();
    await waitFor(() => expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('true'));
    expect(widgetIds()).toEqual(['messages', 'my-sessions', 'resources']);
  });

  it('asks plugins again once the plugin provider has passed them the user', async () => {
    let hasUser = false;
    installPlugin(() => (hasUser ? [reservations] : []), ['reservations-upcoming'], {
      onApiAuthStateChange: () => undefined,
    });
    // Mimics the plugin provider, which hands plugins the user in an effect after this render asked them.
    function PassUser() {
      useEffect(() => {
        hasUser = true;
      }, []);
      return null;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DashboardWidgetsProvider>
          <PassUser />
          <Probe />
        </DashboardWidgetsProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(widgetIds()).toContain('reservations-upcoming'));
  });

  it('offers a plugin widget the plugin returns and its manifest declares', async () => {
    installPlugin(() => [reservations], ['reservations-upcoming']);
    renderProvider();
    await waitFor(() => expect(widgetIds()).toContain('reservations-upcoming'));
    expect(screen.getByRole('status', { name: 'title' })).toHaveTextContent('Upcoming reservations');
  });

  it('ignores a plugin widget missing from the manifest, or one claiming a built-in id', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installPlugin(() => [reservations, { ...reservations, id: 'messages', title: 'Fake inbox' }], ['messages']);
    renderProvider();
    await waitFor(() => expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('true'));
    expect(widgetIds()).toEqual(['messages', 'my-sessions', 'resources']);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('built-in widget id "messages"'));
  });

  it('survives a plugin whose getDashboardWidgets() throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    installPlugin(() => {
      throw new Error('boom');
    }, ['reservations-upcoming']);
    renderProvider();
    await waitFor(() => expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('true'));
    expect(widgetIds()).toEqual(['messages', 'my-sessions', 'resources']);
  });

  it('asks the plugin again when it reports a change, and keeps the title of a widget it withdrew', async () => {
    let offered = [reservations];
    let notify = () => undefined as void;
    installPlugin(() => offered, ['reservations-upcoming'], {
      onDashboardWidgetsChange: (listener) => {
        notify = listener;
        return () => undefined;
      },
    });
    renderProvider();
    await waitFor(() => expect(widgetIds()).toContain('reservations-upcoming'));

    offered = [];
    act(() => notify());

    await waitFor(() => expect(widgetIds()).not.toContain('reservations-upcoming'));
    expect(screen.getByRole('status', { name: 'title' })).toHaveTextContent('Upcoming reservations');
  });
});
