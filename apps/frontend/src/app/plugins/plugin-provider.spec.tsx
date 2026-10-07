import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AttraccessFrontendPlugin } from '@attraccess/plugins-frontend-sdk';
import { PluginProvider } from './plugin-provider';
import usePluginState from './plugin.state';
import { registerRendersItsChildren } from './plugin-provider.does-not-load-a-quarantined-plugin-and-warns-the-user-with-its-failure-detail.test-cases';
import { registerKeepsTheApplicationShellAvailableWhilePluginDiscoveryIsPending } from './plugin-provider.does-not-load-a-quarantined-plugin-and-warns-the-user-with-its-failure-detail.test-cases';
import { registerSetsUpTheModuleFederationRemoteAndLoadsThePluginIntoTheStore } from './plugin-provider.sets-up-the-module-federation-remote-and-loads-the-plugin-into-the-store.test-cases';
import { registerLoadsARecoveredPluginWhenTheTabRegainsFocusWithoutReinstallingLoadedPlugins } from './plugin-provider.does-not-load-a-quarantined-plugin-and-warns-the-user-with-its-failure-detail.test-cases';
import { registerReplacesAPluginInstanceWhenItsVersionChangesOnFocus } from './plugin-provider.does-not-load-a-quarantined-plugin-and-warns-the-user-with-its-failure-detail.test-cases';
import { registerEncodesScopedPackageNamesInFrontendAssetUrls } from './plugin-provider.does-not-load-a-quarantined-plugin-and-warns-the-user-with-its-failure-detail.test-cases';
import { registerSkipsPluginsWithoutAFrontendEntryPoint } from './plugin-provider.sets-up-the-module-federation-remote-and-loads-the-plugin-into-the-store.test-cases';
import { registerNotifiesLoadedPluginsOfTheApiEndpointAndAuthState } from './plugin-provider.does-not-load-a-quarantined-plugin-and-warns-the-user-with-its-failure-detail.test-cases';
import { registerPublishesTheApiBaseUrlBeforeLoadingPluginBundles } from './plugin-provider.does-not-load-a-quarantined-plugin-and-warns-the-user-with-its-failure-detail.test-cases';
import { registerIsolatesAFailingRemoteLoadWithoutCrashingTheAppShell } from './plugin-provider.does-not-load-a-quarantined-plugin-and-warns-the-user-with-its-failure-detail.test-cases';
import { registerDoesNotLoadAQuarantinedPluginAndWarnsTheUserWithItsFailureDetail } from './plugin-provider.does-not-load-a-quarantined-plugin-and-warns-the-user-with-its-failure-detail.test-cases';
import { registerInjectsPluginRoutesThatRenderAndAreNavigable } from './plugin-provider.does-not-load-a-quarantined-plugin-and-warns-the-user-with-its-failure-detail.test-cases';

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
  hoisted.getRemoteMock.mockResolvedValue({
    default: function () {
      return createFakePlugin(name, options.routes ?? []);
    },
  });
  return { name, manifest };
}

beforeEach(() => {
  usePluginState.setState({ plugins: [] });
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
  definePluginProviderTests();
});

describe('required frontend dependencies', () => {
  const manifest = (name: string, dependencies: string[] = []) => ({
    name,
    version: '1.0.0',
    status: 'loaded',
    dependencies: dependencies.map((name) => ({ name, version: '^1', required: true })),
    main: { frontend: { entryPoint: 'index.js' } },
  });
  it('loads a dependency frontend before its dependant', async () => {
    hoisted.refetchMock.mockResolvedValue({ data: [manifest('provider', ['core']), manifest('core')] });
    hoisted.getRemoteMock.mockImplementation(async (name) => ({
      default: function () {
        return createFakePlugin(name);
      },
    }));
    render(<PluginProvider />);
    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(2));
    expect(hoisted.getRemoteMock.mock.calls.map(([name]) => name)).toEqual(['core', 'provider']);
  });
  it('loads unrelated plugins while a required remote is still pending, loading shared dependencies once', async () => {
    hoisted.refetchMock.mockResolvedValue({
      data: [
        manifest('provider', ['core']),
        manifest('second-provider', ['core']),
        manifest('core'),
        manifest('independent'),
      ],
    });
    let finishCore: (value: unknown) => void;
    const coreRemote = new Promise((resolve) => {
      finishCore = resolve;
    });
    hoisted.getRemoteMock.mockImplementation(async (name: string) =>
      name === 'core'
        ? coreRemote
        : {
            default: function () {
              return createFakePlugin(name);
            },
          },
    );
    render(<PluginProvider />);

    try {
      await waitFor(() => expect(usePluginState.getState().plugins.map(({ name }) => name)).toEqual(['independent']));
      expect(hoisted.getRemoteMock.mock.calls.map(([name]) => name)).toEqual(['core', 'independent']);
    } finally {
      finishCore({
        default: function () {
          return createFakePlugin('core');
        },
      });
    }
    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(4));
    expect(hoisted.getRemoteMock.mock.calls.filter(([name]) => name === 'core')).toHaveLength(1);
  });
  it('rejects dependency cycles without blocking independent plugins', async () => {
    hoisted.refetchMock.mockResolvedValue({
      data: [manifest('a', ['b']), manifest('b', ['a']), manifest('independent')],
    });
    hoisted.getRemoteMock.mockImplementation(async (name: string) => ({
      default: function () {
        return createFakePlugin(name);
      },
    }));
    render(<PluginProvider />);
    await waitFor(() => expect(usePluginState.getState().plugins.map(({ name }) => name)).toEqual(['independent']));
    expect(hoisted.getRemoteMock.mock.calls.map(([name]) => name)).toEqual(['independent']);
    expect(hoisted.toastWarningMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Plugin "a" is disabled' }));
    expect(hoisted.toastWarningMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Plugin "b" is disabled' }));
  });
  it('skips a dependant after a dependency frontend fails and explains the failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    hoisted.refetchMock.mockResolvedValue({ data: [manifest('provider', ['core']), manifest('core')] });
    hoisted.getRemoteMock.mockRejectedValue(new Error('core remote unavailable'));
    render(<PluginProvider />);
    await waitFor(() =>
      expect(hoisted.toastWarningMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Plugin "provider" is disabled',
          description: expect.stringContaining('core failed to load'),
        }),
      ),
    );
    expect(hoisted.getRemoteMock.mock.calls.map(([name]) => name)).toEqual(['core']);
    expect(usePluginState.getState().plugins).toHaveLength(0);
  });
  it('allows a required plugin with only a backend and rejects missing dependencies', async () => {
    hoisted.refetchMock.mockResolvedValue({
      data: [manifest('provider', ['core']), { ...manifest('core'), main: {} }, manifest('broken', ['missing'])],
    });
    hoisted.getRemoteMock.mockImplementation(async (name) => ({
      default: function () {
        return createFakePlugin(name);
      },
    }));
    render(<PluginProvider />);
    await waitFor(() =>
      expect(hoisted.toastWarningMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Plugin "broken" is disabled' }),
      ),
    );
    expect(hoisted.getRemoteMock.mock.calls.map(([name]) => name)).toEqual(['provider']);
  });
});

export function definePluginProviderTests() {
  const scope = {
    get hoisted() {
      return hoisted;
    },
    primeManifest,
    createFakePlugin,
  };
  registerRendersItsChildren(scope);

  registerKeepsTheApplicationShellAvailableWhilePluginDiscoveryIsPending(scope);

  registerSetsUpTheModuleFederationRemoteAndLoadsThePluginIntoTheStore(scope);

  registerLoadsARecoveredPluginWhenTheTabRegainsFocusWithoutReinstallingLoadedPlugins(scope);

  registerReplacesAPluginInstanceWhenItsVersionChangesOnFocus(scope);

  it('unwraps the default export when the remote returns one', async () => {
    primeManifest();
    render(<PluginProvider />);
    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));
    expect(usePluginState.getState().plugins[0].plugin.getPluginName()).toMatch(/^Plugin/);
  });

  registerEncodesScopedPackageNamesInFrontendAssetUrls(scope);

  registerSkipsPluginsWithoutAFrontendEntryPoint(scope);

  registerNotifiesLoadedPluginsOfTheApiEndpointAndAuthState(scope);

  // The SDK's preconfigured client reads the origin off `window`, so it has to
  // be published before a plugin bundle can run a module-level request.
  registerPublishesTheApiBaseUrlBeforeLoadingPluginBundles(scope);

  registerIsolatesAFailingRemoteLoadWithoutCrashingTheAppShell(scope);

  registerDoesNotLoadAQuarantinedPluginAndWarnsTheUserWithItsFailureDetail(scope);

  registerInjectsPluginRoutesThatRenderAndAreNavigable(scope);

  return scope;
}

export type PluginProviderTestScope = ReturnType<typeof definePluginProviderTests>;
