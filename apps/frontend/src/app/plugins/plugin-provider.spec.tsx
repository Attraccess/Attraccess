import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl, type AttraccessFrontendPlugin } from '@attraccess/plugins-frontend-sdk';
import { PluginProvider } from './plugin-provider';
import usePluginState from './plugin.state';

const hoisted = vi.hoisted(() => ({
  setRemoteMock: vi.fn(),
  getRemoteMock: vi.fn(),
  refetchMock: vi.fn(),
  getBaseUrlMock: vi.fn(() => 'http://test.local'),
  toastWarningMock: vi.fn(),
  user: { id: 1, username: 'admin' } as Record<string, unknown> | null,
}));

vi.mock('virtual:__federation__', () => ({
  __federation_method_setRemote: hoisted.setRemoteMock,
  __federation_method_getRemote: hoisted.getRemoteMock,
}));

vi.mock('@attraccess/react-query-client', () => ({
  usePluginsServiceGetPlugins: () => ({ refetch: hoisted.refetchMock }),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: hoisted.user }),
}));

vi.mock('../../api', () => ({
  getBaseUrl: hoisted.getBaseUrlMock,
}));

vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({ showToast: vi.fn(), success: vi.fn(), error: vi.fn(), warning: hoisted.toastWarningMock }),
}));

let pluginCounter = 0;

function createFakePlugin(name: string, routes: unknown[] = []): AttraccessFrontendPlugin {
  return {
    getPluginName: () => name,
    getDependencies: () => [],
    init: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
    onApiAuthStateChange: vi.fn(),
    onApiEndpointChange: vi.fn(),
    getRoutes: () => routes,
  } as unknown as AttraccessFrontendPlugin;
}

interface ManifestOptions {
  name?: string;
  entryPoint?: string | undefined;
  styles?: string;
  routes?: unknown[];
}

function primeManifest(options: ManifestOptions = {}) {
  const name = options.name ?? `Plugin${++pluginCounter}`;
  const manifest = {
    name,
    version: '1.0.0',
    main: {
      frontend: {
        entryPoint: 'entryPoint' in options ? options.entryPoint : 'index.js',
        ...(options.styles ? { styles: options.styles } : {}),
      },
    },
  };
  hoisted.refetchMock.mockResolvedValue({ data: [manifest] });
  hoisted.getRemoteMock.mockResolvedValue({ default: function () {
    return createFakePlugin(name, options.routes ?? []);
  } });
  return { name, manifest };
}

beforeEach(() => {
  usePluginState.setState({ isLoading: true, plugins: [] });
  hoisted.setRemoteMock.mockReset();
  hoisted.getRemoteMock.mockReset();
  hoisted.refetchMock.mockReset();
  hoisted.getBaseUrlMock.mockReturnValue('http://test.local');
  hoisted.toastWarningMock.mockReset();
  hoisted.user = { id: 1, username: 'admin' };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PluginProvider', () => {
  it('renders its children', async () => {
    hoisted.refetchMock.mockResolvedValue({ data: [] });
    render(
      <PluginProvider>
        <div>app-shell</div>
      </PluginProvider>
    );
    expect(screen.getByText('app-shell')).toBeInTheDocument();
  });

  it('keeps the application shell available while plugin discovery is pending', () => {
    hoisted.refetchMock.mockReturnValue(new Promise(() => undefined));

    render(
      <PluginProvider>
        <div>core route</div>
      </PluginProvider>
    );

    expect(screen.getByText('core route')).toBeInTheDocument();
  });

  it('sets up the module-federation remote and loads the plugin into the store', async () => {
    const { name } = primeManifest();

    render(
      <PluginProvider>
        <div>app-shell</div>
      </PluginProvider>
    );

    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));

    expect(hoisted.setRemoteMock).toHaveBeenCalledWith(
      name,
      expect.objectContaining({ format: 'esm', from: 'vite' })
    );
    expect(hoisted.getRemoteMock).toHaveBeenCalledWith(name, './plugin');
    expect(usePluginState.getState().isLoading).toBe(false);

    const remoteConfig = hoisted.setRemoteMock.mock.calls.at(-1)?.[1] as { url: () => Promise<string> };
    await expect(remoteConfig.url()).resolves.toBe(
      `http://test.local/api/plugins/${name}/frontend/module-federation/index.js`
    );
  });

  it('unwraps the default export when the remote returns one', async () => {
    primeManifest();
    render(<PluginProvider />);
    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));
    expect(usePluginState.getState().plugins[0].plugin.getPluginName()).toMatch(/^Plugin/);
  });

  it('encodes scoped package names in frontend asset URLs', async () => {
    const { name } = primeManifest({ name: '@attraccess/plugin-wago', styles: 'style.css' });
    const appendChild = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node);

    render(<PluginProvider />);

    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));

    const remoteConfig = hoisted.setRemoteMock.mock.calls.at(-1)?.[1] as { url: () => Promise<string> };
    await expect(remoteConfig.url()).resolves.toBe(
      'http://test.local/api/plugins/%40attraccess%2Fplugin-wago/frontend/module-federation/index.js'
    );
    const styleLink = appendChild.mock.calls.find(([node]) => node instanceof HTMLLinkElement)?.[0];
    expect(styleLink).toHaveAttribute('id', `plugin-styles-${name}`);
    expect(styleLink).toHaveAttribute(
      'href',
      'http://test.local/api/plugins/%40attraccess%2Fplugin-wago/frontend/module-federation/style.css'
    );
  });

  it('skips plugins without a frontend entry point', async () => {
    primeManifest({ entryPoint: undefined });

    render(<PluginProvider />);

    await waitFor(() => expect(hoisted.refetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(hoisted.setRemoteMock).not.toHaveBeenCalled();
    expect(usePluginState.getState().plugins).toHaveLength(0);
  });

  it('notifies loaded plugins of the API endpoint and auth state', async () => {
    primeManifest();

    render(<PluginProvider />);

    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));

    const instance = usePluginState.getState().plugins[0].plugin;
    await waitFor(() => expect(instance.onApiEndpointChange).toHaveBeenCalledWith('http://test.local'));
    expect(instance.onApiAuthStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ authToken: '', user: hoisted.user })
    );
  });

  // The SDK's preconfigured client reads the origin off `window`, so it has to
  // be published before a plugin bundle can run a module-level request.
  it('publishes the API base URL before loading plugin bundles', async () => {
    const { name } = primeManifest();
    let baseUrlDuringLoad: string | undefined;
    hoisted.getRemoteMock.mockImplementation(() => {
      baseUrlDuringLoad = getApiBaseUrl();
      return Promise.resolve({
        default: function () {
          return createFakePlugin(name);
        },
      });
    });

    render(<PluginProvider />);

    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));
    expect(baseUrlDuringLoad).toBe('http://test.local');
  });

  it('isolates a failing remote load without crashing the app shell', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    hoisted.refetchMock.mockResolvedValue({
      data: [{ name: 'BrokenPlugin', version: '1.0.0', main: { frontend: { entryPoint: 'index.js' } } }],
    });
    hoisted.getRemoteMock.mockRejectedValue(new Error('federation boom'));

    render(
      <PluginProvider>
        <div>app-shell</div>
      </PluginProvider>
    );

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(usePluginState.getState().plugins).toHaveLength(0);
    expect(screen.getByText('app-shell')).toBeInTheDocument();
  });

  it('does not load a quarantined plugin and warns the user with its failure detail', async () => {
    hoisted.refetchMock.mockResolvedValue({
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

    await waitFor(() => expect(hoisted.toastWarningMock).toHaveBeenCalled());
    expect(hoisted.toastWarningMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Plugin "BrokenPlugin" is disabled', description: expect.stringContaining('startup failed') }),
    );
    expect(hoisted.getRemoteMock).not.toHaveBeenCalled();
  });

  it('injects plugin routes that render and are navigable', async () => {
    primeManifest({
      routes: [
        {
          path: '/plugin-a',
          authRequired: false,
          element: (
            <div>
              Plugin Page A
              <Link to="/plugin-b">Go to B</Link>
            </div>
          ),
        },
        { path: '/plugin-b', authRequired: false, element: <div>Plugin Page B</div> },
      ],
    });

    render(<PluginProvider />);
    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));

    const routes = usePluginState
      .getState()
      .plugins.flatMap((p) => p.plugin.getRoutes?.() ?? []) as Array<{ path: string; element: React.ReactNode }>;

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/plugin-a']}>
        <Routes>
          {routes.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Plugin Page A')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Go to B' }));
    expect(screen.getByText('Plugin Page B')).toBeInTheDocument();
  });
});
