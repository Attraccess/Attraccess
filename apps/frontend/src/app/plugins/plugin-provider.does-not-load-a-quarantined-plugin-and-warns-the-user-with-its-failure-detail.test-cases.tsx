import { render } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import { it } from 'vitest';
import { PluginProvider } from './plugin-provider';
import type { PluginProviderTestScope } from './plugin-provider.spec';
import { vi } from 'vitest';
import usePluginState from './plugin.state';
import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Routes } from 'react-router-dom';
import { Route } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { getApiBaseUrl } from '@attraccess/plugins-frontend-sdk';

export function registerDoesNotLoadAQuarantinedPluginAndWarnsTheUserWithItsFailureDetail(
  scope: PluginProviderTestScope,
): void {
  it('does not load a quarantined plugin and warns the user with its failure detail', async () => {
    scope.hoisted.refetchMock.mockResolvedValue({
      data: [
        {
          name: 'BrokenPlugin',
          version: '1.0.0',
          status: 'error',
          error: 'Plugin was automatically disabled after startup failed',
          main: { frontend: { entryPoint: 'index.js' } },
        },
      ],
    });

    render(<PluginProvider />);

    await waitFor(() => expect(scope.hoisted.toastWarningMock).toHaveBeenCalled());
    expect(scope.hoisted.toastWarningMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Plugin "BrokenPlugin" is disabled',
        description: expect.stringContaining('startup failed'),
      }),
    );
    expect(scope.hoisted.getRemoteMock).not.toHaveBeenCalled();
  });
}

export function registerEncodesScopedPackageNamesInFrontendAssetUrls(scope: PluginProviderTestScope): void {
  it('encodes scoped package names in frontend asset URLs', async () => {
    const { name } = scope.primeManifest({ name: '@attraccess/plugin-demo', styles: 'style.css' });
    const appendChild = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node);

    render(<PluginProvider />);

    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));

    const remoteConfig = scope.hoisted.setRemoteMock.mock.calls.at(-1)?.[1] as { url: () => Promise<string> };
    await expect(remoteConfig.url()).resolves.toBe(
      'http://test.local/api/plugins/%40attraccess%2Fplugin-demo/frontend/module-federation/index.js?v=1.0.0',
    );
    const styleLink = appendChild.mock.calls.find(([node]) => node instanceof HTMLLinkElement)?.[0];
    expect(styleLink).toHaveAttribute('id', `plugin-styles-${name}`);
    expect(styleLink).toHaveAttribute(
      'href',
      'http://test.local/api/plugins/%40attraccess%2Fplugin-demo/frontend/module-federation/style.css?v=1.0.0',
    );
  });
}

export function registerInjectsPluginRoutesThatRenderAndAreNavigable(scope: PluginProviderTestScope): void {
  it('injects plugin routes that render and are navigable', async () => {
    scope.primeManifest({
      routes: [
        {
          path: '/plugin-a',
          authRequired: false,
          element: (
            <div>
              Plugin Page A<Link to="/plugin-b">Go to B</Link>
            </div>
          ),
        },
        { path: '/plugin-b', authRequired: false, element: <div>Plugin Page B</div> },
      ],
    });

    render(<PluginProvider />);
    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));

    const routes = usePluginState.getState().plugins.flatMap((p) => p.plugin.getRoutes?.() ?? []) as Array<{
      path: string;
      element: React.ReactNode;
    }>;

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/plugin-a']}>
        <Routes>
          {routes.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Plugin Page A')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Go to B' }));
    expect(screen.getByText('Plugin Page B')).toBeInTheDocument();
  });
}

export function registerIsolatesAFailingRemoteLoadWithoutCrashingTheAppShell(scope: PluginProviderTestScope): void {
  it('isolates a failing remote load without crashing the app shell', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    scope.hoisted.refetchMock.mockResolvedValue({
      data: [{ name: 'BrokenPlugin', version: '1.0.0', main: { frontend: { entryPoint: 'index.js' } } }],
    });
    scope.hoisted.getRemoteMock.mockRejectedValue(new Error('federation boom'));

    render(
      <PluginProvider>
        <div>app-shell</div>
      </PluginProvider>,
    );

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(usePluginState.getState().plugins).toHaveLength(0);
    expect(screen.getByText('app-shell')).toBeInTheDocument();
  });
}

export function registerKeepsTheApplicationShellAvailableWhilePluginDiscoveryIsPending(
  scope: PluginProviderTestScope,
): void {
  it('keeps the application shell available while plugin discovery is pending', () => {
    scope.hoisted.refetchMock.mockReturnValue(new Promise(() => undefined));

    render(
      <PluginProvider>
        <div>core route</div>
      </PluginProvider>,
    );

    expect(screen.getByText('core route')).toBeInTheDocument();
  });
}

export function registerLoadsARecoveredPluginWhenTheTabRegainsFocusWithoutReinstallingLoadedPlugins(
  scope: PluginProviderTestScope,
): void {
  it('loads a recovered plugin when the tab regains focus without reinstalling loaded plugins', async () => {
    const recovered = {
      name: '@attraccess/plugin-wago',
      version: '1.0.0',
      main: { frontend: { entryPoint: 'remoteEntry.js' } },
    };
    const healthy = {
      name: '@attraccess/plugin-rabbitmq',
      version: '1.0.0',
      main: { frontend: { entryPoint: 'remoteEntry.js' } },
    };
    scope.hoisted.refetchMock
      .mockResolvedValueOnce({ data: [{ ...recovered, status: 'error', error: 'incomplete startup' }, healthy] })
      .mockResolvedValue({ data: [{ ...recovered, status: 'loaded', error: null }, healthy] });
    scope.hoisted.getRemoteMock.mockImplementation(async (name: string) => ({
      default: function () {
        return scope.createFakePlugin(name);
      },
    }));

    render(<PluginProvider />);
    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));
    expect(scope.hoisted.toastWarningMock).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(2));
    expect(scope.hoisted.getRemoteMock).toHaveBeenCalledTimes(2);
    expect(scope.hoisted.toastWarningMock).toHaveBeenCalledTimes(1);
  });
}

export function registerNotifiesLoadedPluginsOfTheApiEndpointAndAuthState(scope: PluginProviderTestScope): void {
  it('notifies loaded plugins of the API endpoint and auth state', async () => {
    scope.primeManifest();

    render(<PluginProvider />);

    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));

    const instance = usePluginState.getState().plugins[0].plugin;
    await waitFor(() => expect(instance.onApiEndpointChange).toHaveBeenCalledWith('http://test.local'));
    expect(instance.onApiAuthStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ authToken: '', user: scope.hoisted.user }),
    );
  });
}

export function registerPublishesTheApiBaseUrlBeforeLoadingPluginBundles(scope: PluginProviderTestScope): void {
  it('publishes the API base URL before loading plugin bundles', async () => {
    const { name } = scope.primeManifest();
    let baseUrlDuringLoad: string | undefined;
    scope.hoisted.getRemoteMock.mockImplementation(() => {
      baseUrlDuringLoad = getApiBaseUrl();
      return Promise.resolve({
        default: function () {
          return scope.createFakePlugin(name);
        },
      });
    });

    render(<PluginProvider />);

    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));
    expect(baseUrlDuringLoad).toBe('http://test.local');
  });
}

export function registerRendersItsChildren(scope: PluginProviderTestScope): void {
  it('renders its children', async () => {
    scope.hoisted.refetchMock.mockResolvedValue({ data: [] });
    render(
      <PluginProvider>
        <div>app-shell</div>
      </PluginProvider>,
    );
    expect(screen.getByText('app-shell')).toBeInTheDocument();
  });
}

export function registerReplacesAPluginInstanceWhenItsVersionChangesOnFocus(scope: PluginProviderTestScope): void {
  it('replaces a plugin instance when its version changes on focus', async () => {
    const name = '@attraccess/plugin-wago';
    const manifest = { name, version: '1.0.0', main: { frontend: { entryPoint: 'remoteEntry.js' } } };
    scope.hoisted.refetchMock
      .mockResolvedValueOnce({ data: [manifest] })
      .mockResolvedValue({ data: [{ ...manifest, version: '2.0.0' }] });
    scope.hoisted.getRemoteMock.mockImplementation(async () => ({
      default: function () {
        return scope.createFakePlugin(name);
      },
    }));

    render(<PluginProvider />);
    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));
    const previous = usePluginState.getState().plugins[0].plugin;

    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(usePluginState.getState().plugins[0].version).toBe('2.0.0'));
    expect(usePluginState.getState().plugins).toHaveLength(1);
    expect(usePluginState.getState().plugins[0].plugin).not.toBe(previous);
    expect(scope.hoisted.getRemoteMock).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(scope.hoisted.refetchMock).toHaveBeenCalledTimes(3));
    expect(scope.hoisted.getRemoteMock).toHaveBeenCalledTimes(2);
    expect(usePluginState.getState().plugins).toHaveLength(1);
  });
}
