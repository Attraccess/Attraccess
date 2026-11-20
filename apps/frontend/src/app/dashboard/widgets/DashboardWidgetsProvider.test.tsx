import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AttraccessFrontendPlugin, PluginDashboardWidget } from '@attraccess/plugins-frontend-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePluginState, { PluginManifestWithPlugin } from '../../plugins/plugin.state';
import { DashboardWidgetsProvider } from './DashboardWidgetsProvider';
import { DashboardWidget, useDashboardWidgets } from './widgetsContext';
import * as sdk from '@attraccess/react-query-client/sdk';
import { sdkResult } from '../../../test-utils/sdk-mock';

vi.mock('@attraccess/react-query-client/sdk', async (importOriginal) =>
  (await import('../../../test-utils/sdk-mock')).spyOnSdk(await importOriginal<object>()),
);

const state = vi.hoisted(() => ({ openable: new Set<string>(), widgets: [] as DashboardWidget[] }));

vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }) }));
vi.mock('./access', () => ({ useCanOpenPage: () => (path: string) => state.openable.has(path) }));

function Probe() {
  const { widgets, titleOf, isReady } = useDashboardWidgets();
  state.widgets = widgets;
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
  vi.mocked(sdk.getLicenseInformation).mockResolvedValue(sdkResult({ modules: [] }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DashboardWidgetsProvider', () => {
  it('offers the built-in widgets whose page the user may open', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('true'));
    expect(widgetIds()).toEqual(['messages', 'my-sessions', 'resources-in-use', 'resources']);
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
    await waitFor(() => expect(sdk.getLicenseInformation).toHaveBeenCalled());
    // Lets the resolved license reach the query cache.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('false');
    act(() => usePluginState.setState({ isInitialized: true }));
    expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('true');
  });

  it('is not ready while the license loads, even with the plugins loaded', async () => {
    let resolveLicense: (license: unknown) => void = () => undefined;
    vi.mocked(sdk.getLicenseInformation).mockReturnValue(new Promise((resolve) => (resolveLicense = resolve)) as never);
    renderProvider();
    await waitFor(() => expect(sdk.getLicenseInformation).toHaveBeenCalled());
    expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('false');
    await act(async () => resolveLicense(sdkResult({ modules: [] })));
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
    expect(widgetIds()).toEqual(['messages', 'my-sessions', 'resources-in-use', 'resources']);
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

  const pluginWidget = (id: string) => state.widgets.find((widget) => widget.id === id);

  it('gives a plugin widget the SDK defaults: medium only, in a group named after the plugin', async () => {
    installPlugin(() => [reservations], ['reservations-upcoming']);
    renderProvider();
    await waitFor(() => expect(widgetIds()).toContain('reservations-upcoming'));

    expect(pluginWidget('reservations-upcoming')).toMatchObject({
      sizes: ['medium'],
      defaultSize: 'medium',
      group: { id: 'plugin:report', title: 'Report' },
      href: undefined,
      keywords: undefined,
    });
  });

  it('passes the sizes, group, link and keywords a plugin widget declares', async () => {
    const other = { ...reservations, id: 'reservations-manage', group: undefined };
    installPlugin(
      () => [
        {
          ...reservations,
          sizes: ['large', 'small', 'huge' as never],
          defaultSize: 'large',
          group: 'Reservations',
          href: '/reservations',
          keywords: ['booking'],
        },
        other,
        { ...reservations, id: 'reservations-stats', group: 'Statistics' },
      ],
      ['reservations-upcoming', 'reservations-manage', 'reservations-stats'],
    );
    renderProvider();
    await waitFor(() => expect(widgetIds()).toContain('reservations-stats'));

    expect(pluginWidget('reservations-upcoming')).toMatchObject({
      sizes: ['small', 'large'],
      defaultSize: 'large',
      group: { id: 'plugin:report', title: 'Reservations' },
      href: '/reservations',
      keywords: ['booking'],
    });
    // A widget without a group joins the plugin's group, named by its first widget that names one.
    expect(pluginWidget('reservations-manage')?.group).toEqual({ id: 'plugin:report', title: 'Reservations' });
    expect(pluginWidget('reservations-stats')?.group).toEqual({ id: 'group:Statistics', title: 'Statistics' });
  });

  it('falls back to the first size when the default is not one of them', async () => {
    installPlugin(
      () => [{ ...reservations, sizes: ['small', 'medium'], defaultSize: 'large' }],
      ['reservations-upcoming'],
    );
    renderProvider();
    await waitFor(() => expect(widgetIds()).toContain('reservations-upcoming'));
    expect(pluginWidget('reservations-upcoming')?.defaultSize).toBe('small');
  });

  it('defaults to the first size the plugin lists, and drops keywords and groups that are no text', async () => {
    installPlugin(
      () => [
        {
          ...reservations,
          sizes: ['large', 'medium'],
          keywords: ['booking', 1 as never, ''],
          group: { name: 'x' } as never,
        },
      ],
      ['reservations-upcoming'],
    );
    renderProvider();
    await waitFor(() => expect(widgetIds()).toContain('reservations-upcoming'));

    expect(pluginWidget('reservations-upcoming')).toMatchObject({
      sizes: ['medium', 'large'],
      defaultSize: 'large',
      keywords: ['booking'],
      group: { id: 'plugin:report', title: 'Report' },
    });
  });

  it('renders plugin widgets with the tile size, also widgets whose render() takes no arguments', async () => {
    const sized = vi.fn(() => 'sized');
    const legacy = vi.fn(() => 'legacy');
    installPlugin(
      () => [
        { ...reservations, render: sized },
        { ...reservations, id: 'reservations-legacy', render: legacy },
      ],
      ['reservations-upcoming', 'reservations-legacy'],
    );
    renderProvider();
    await waitFor(() => expect(widgetIds()).toContain('reservations-legacy'));

    expect(pluginWidget('reservations-upcoming')?.renderBody({ size: 'large', isPreview: true })).toBe('sized');
    expect(sized).toHaveBeenCalledWith({ size: 'large', isPreview: true });
    expect(pluginWidget('reservations-legacy')?.renderBody({ size: 'medium', isPreview: false })).toBe('legacy');
  });

  it('describes built-in widgets with their page, group and sizes', async () => {
    renderProvider();
    await waitFor(() => expect(widgetIds()).toContain('messages'));
    expect(pluginWidget('messages')).toMatchObject({
      href: '/messages',
      group: { id: 'messages', title: 'Messages' },
      sizes: ['small', 'medium', 'large'],
      defaultSize: 'medium',
      keywords: ['inbox', 'chat', 'unread'],
    });
  });

  it('ignores a plugin widget missing from the manifest, or one claiming a built-in id', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installPlugin(() => [reservations, { ...reservations, id: 'messages', title: 'Fake inbox' }], ['messages']);
    renderProvider();
    await waitFor(() => expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('true'));
    expect(widgetIds()).toEqual(['messages', 'my-sessions', 'resources-in-use', 'resources']);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('built-in widget id "messages"'));
  });

  it('survives a plugin whose getDashboardWidgets() throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    installPlugin(() => {
      throw new Error('boom');
    }, ['reservations-upcoming']);
    renderProvider();
    await waitFor(() => expect(screen.getByRole('status', { name: 'ready' })).toHaveTextContent('true'));
    expect(widgetIds()).toEqual(['messages', 'my-sessions', 'resources-in-use', 'resources']);
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
