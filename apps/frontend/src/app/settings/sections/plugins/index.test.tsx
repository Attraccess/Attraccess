import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginsSection } from './index';

interface DeleteOptions {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

const hoisted = vi.hoisted(() => ({
  deleteMutateMock: vi.fn(),
  successToast: vi.fn(),
  errorToast: vi.fn(),
  showToast: vi.fn(),
  plugins: [] as unknown[],
  deleteOptions: undefined as DeleteOptions | undefined,
}));

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

vi.mock('@attraccess/react-query-client', () => ({
  usePluginsServiceGetPlugins: () => ({ data: hoisted.plugins }),
  usePluginsServiceDeletePlugin: (options: DeleteOptions) => {
    hoisted.deleteOptions = options;
    return { mutate: hoisted.deleteMutateMock, isPending: false };
  },
  usePluginsServiceUploadPlugin: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({
    success: hoisted.successToast,
    error: hoisted.errorToast,
    showToast: hoisted.showToast,
  }),
}));

function makePlugin(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plugin-1',
    name: 'Cool Plugin',
    version: '1.2.3',
    pluginDirectory: '/plugins/cool',
    permissions: ['read:resources', 'write:resources'],
    ...overrides,
  };
}

beforeEach(() => {
  hoisted.deleteMutateMock.mockReset();
  hoisted.successToast.mockReset();
  hoisted.errorToast.mockReset();
  hoisted.plugins = [];
  hoisted.deleteOptions = undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: { url?: string } | string) => {
      const url = typeof input === 'string' ? input : (input.url ?? '');
      const plugin = {
        name: '@attraccess/plugin-shelly',
        version: '1.0.0',
        displayName: 'Shelly',
        description: 'Official integration',
        permissions: [],
        hostRange: '^1.0.0',
        sdkCompatibility: { backend: '^1.0.0', frontend: null },
        repository: null,
        homepage: null,
        license: 'MIT',
        publisher: 'attraccess',
        deprecated: false,
        registry: { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org' },
        classification: 'official' as const,
        classificationReason: 'Published by Attraccess on npm',
        installable: true,
        incompatibilityReason: null,
        integrity: 'sha512-test',
        provenance: null,
      };
      if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({
        ok: true,
        json: async () => (url.includes('/marketplace/search') ? { results: [plugin], errors: [] } : plugin),
      });
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PluginsSection', () => {
  it('renders the section heading, install menu and table headers', () => {
    render(<PluginsSection />);

    expect(screen.getByRole('heading', { name: 'Plugins' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install plugin' })).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Version')).toBeInTheDocument();
    expect(screen.getByText('Directory')).toBeInTheDocument();
    expect(screen.getByText('Permissions')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  async function openMarketplace(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Install plugin' }));
    await user.click(screen.getByText('Browse marketplace'));
  }

  it('renders the official marketplace classification', async () => {
    const user = userEvent.setup();
    render(<PluginsSection />);
    await openMarketplace(user);

    expect(await screen.findByText('Shelly')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Official plugins' })).toBeInTheDocument();
    expect(screen.getByText('Official')).toBeInTheDocument();
    expect(screen.getByText('Version: 1.0.0')).toBeInTheDocument();
  });

  it('uses exact package lookup when a selected registry cannot be searched', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string } | string) => {
        const url = typeof input === 'string' ? input : (input.url ?? '');
        if (url.endsWith('/api/plugins/registries'))
          return Promise.resolve({
            ok: true,
            json: async () => [{ id: 'private', name: 'Private', url: 'https://packages.example.com' }],
          });
        if (url.includes('/marketplace/search')) return Promise.resolve({ ok: false });
        return Promise.resolve({
          ok: true,
          json: async () => ({
            name: '@private/plugin',
            version: '1.0.0',
            displayName: 'Private plugin',
            permissions: [],
            registry: { id: 'private', name: 'Private', url: 'https://packages.example.com' },
            classification: 'community',
            installable: true,
          }),
        });
      }),
    );
    render(<PluginsSection />);
    await openMarketplace(user);

    await user.selectOptions(screen.getByLabelText('Registry'), 'private');
    await user.type(screen.getByLabelText('Search plugins'), '@private/plugin');

    expect(await screen.findByText('Private plugin')).toBeInTheDocument();
  });

  it('keeps incompatible marketplace packages visible with their reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string } | string) => {
        const url = typeof input === 'string' ? input : (input.url ?? '');
        if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
        if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              {
                name: '@example/incompatible',
                version: '1.0.0',
                displayName: 'Incompatible Plugin',
                registry: { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org' },
                classification: 'community',
                installable: false,
                incompatibilityReason: 'Plugin is not compatible with Attraccess 1.0.0',
              },
            ],
            errors: [],
          }),
        });
      }),
    );
    const user = userEvent.setup();
    render(<PluginsSection />);
    await openMarketplace(user);

    expect(await screen.findByText('Plugin is not compatible with Attraccess 1.0.0')).toBeInTheDocument();
  });

  it('requires source and permission acknowledgement before installing', async () => {
    const user = userEvent.setup();
    render(<PluginsSection />);
    await openMarketplace(user);

    await user.click(await screen.findByText('Shelly'));
    await user.click(screen.getByRole('button', { name: 'Install' }));

    const installDialog = screen.getByRole('heading', { name: 'Install Shelly?' }).closest('[role="dialog"]');
    expect(installDialog).not.toBeNull();
    const confirm = within(installDialog as HTMLElement).getByRole('button', { name: 'Install plugin' });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(confirm).toBeEnabled();
    expect(
      screen.getByText('Installing this plugin requires an application restart to activate it.'),
    ).toBeInTheDocument();
  });

  it('installs an exact private package version from its selected registry', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: { url?: string } | string, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input.url ?? '');
      if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/api/plugins/registries'))
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: 'private', name: 'Private', url: 'https://packages.example.com' }],
        });
      if (url.includes('/marketplace/search')) return Promise.resolve({ ok: false });
      if (url.includes('/marketplace/'))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            name: '@private/plugin',
            version: '2.3.4',
            displayName: 'Private plugin',
            permissions: ['read:resources'],
            registry: { id: 'private', name: 'Private', url: 'https://packages.example.com' },
            classification: 'community',
            installable: true,
          }),
        });
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<PluginsSection />);
    await openMarketplace(user);

    await user.selectOptions(screen.getByLabelText('Registry'), 'private');
    await user.type(screen.getByLabelText('Search plugins'), '@private/plugin');
    await user.click(await screen.findByText('Private plugin'));
    await user.click(await screen.findByRole('button', { name: 'Install' }));
    await user.click(screen.getByRole('checkbox'));
    const installDialog = screen.getByRole('heading', { name: 'Install Private plugin?' }).closest('[role="dialog"]');
    expect(installDialog).not.toBeNull();
    await user.click(within(installDialog as HTMLElement).getByRole('button', { name: 'Install plugin' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/plugins/npm/%40private%2Fplugin/versions/2.3.4'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ registryId: 'private' }) }),
      ),
    );
  });

  it('shows only the configured state for registry tokens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string } | string) => {
        const url = typeof input === 'string' ? input : (input.url ?? '');
        if (url.endsWith('/api/plugins/registries'))
          return Promise.resolve({
            ok: true,
            json: async () => [
              { id: 'private', name: 'Private', url: 'https://packages.example.test/npm', tokenConfigured: true },
            ],
          });
        if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
        return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
      }),
    );
    const user = userEvent.setup();
    render(<PluginsSection />);
    await openMarketplace(user);

    await user.click(screen.getByText('Manage registries'));
    expect(await screen.findByText(/Private.*Token configured/)).toBeInTheDocument();
    expect(screen.getByLabelText('Access token (write-only)')).toHaveAttribute('type', 'password');
  });

  it('keeps the latest registry refresh when an earlier load completes late', async () => {
    const initial = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const refreshed = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    let registryLoads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string; method?: string } | string, init?: { method?: string }) => {
        const request = typeof input === 'string' ? { url: input, method: init?.method } : input;
        if (request.url?.endsWith('/api/plugins/registries')) {
          if (request.method === 'POST') return Promise.resolve({ ok: true });
          registryLoads += 1;
          return registryLoads === 1 ? initial.promise : refreshed.promise;
        }
        if (request.url?.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
        return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
      }),
    );
    const user = userEvent.setup();
    render(<PluginsSection />);
    await openMarketplace(user);

    await waitFor(() => expect(registryLoads).toBe(1));
    await user.click(screen.getByText('Manage registries'));
    await user.type(screen.getByLabelText('Registry name'), 'Private');
    await user.type(screen.getByLabelText('Registry URL'), 'https://packages.example.test/npm');
    await user.click(screen.getByRole('button', { name: 'Add registry' }));

    refreshed.resolve({
      ok: true,
      json: async () => [
        { id: 'private', name: 'Private', url: 'https://packages.example.test/npm', tokenConfigured: false },
      ],
    });
    expect(await screen.findByText(/Private.*No token/)).toBeInTheDocument();
    initial.resolve({ ok: true, json: async () => [] });

    await waitFor(() => expect(screen.getByText(/Private.*No token/)).toBeInTheDocument());
  });

  it('does not report a registry add as successful when its refresh fails', async () => {
    let registryLoads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string; method?: string } | string, init?: { method?: string }) => {
        const request = typeof input === 'string' ? { url: input, method: init?.method } : input;
        if (request.url?.endsWith('/api/plugins/registries')) {
          if (request.method === 'POST') return Promise.resolve({ ok: true });
          registryLoads += 1;
          return Promise.resolve(registryLoads === 1 ? { ok: true, json: async () => [] } : { ok: false });
        }
        if (request.url?.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
        return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
      }),
    );
    const user = userEvent.setup();
    render(<PluginsSection />);
    await openMarketplace(user);

    await user.click(screen.getByText('Manage registries'));
    await user.type(screen.getByLabelText('Registry name'), 'Private');
    await user.type(screen.getByLabelText('Registry URL'), 'https://packages.example.test/npm');
    await user.click(screen.getByRole('button', { name: 'Add registry' }));

    await waitFor(() => expect(hoisted.errorToast).toHaveBeenCalled());
    expect(hoisted.successToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Registry added.' }));
  });

  it('keeps a newer test for the same registry pending when an earlier test completes', async () => {
    const firstTest = deferred<{ ok: boolean }>();
    const secondTest = deferred<{ ok: boolean }>();
    const latestFirstTest = deferred<{ ok: boolean }>();
    let firstTestRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string } | string, init?: { method?: string }) => {
        const request = typeof input === 'string' ? { url: input, method: init?.method } : input;
        if (request.url?.endsWith('/api/plugins/registries'))
          return Promise.resolve({
            ok: true,
            json: async () => [
              { id: 'first', name: 'First', url: 'https://first.example.test', tokenConfigured: false },
              { id: 'second', name: 'Second', url: 'https://second.example.test', tokenConfigured: false },
            ],
          });
        if (request.url?.endsWith('/registries/first/test')) {
          firstTestRequests += 1;
          return firstTestRequests === 1 ? firstTest.promise : latestFirstTest.promise;
        }
        if (request.url?.endsWith('/registries/second/test')) return secondTest.promise;
        if (request.url?.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
        return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
      }),
    );
    const user = userEvent.setup();
    render(<PluginsSection />);
    await openMarketplace(user);

    await user.click(screen.getByText('Manage registries'));
    const testButtons = await screen.findAllByRole('button', { name: 'Test' });
    await user.click(testButtons[0]);
    await user.click(testButtons[1]);
    expect(testButtons[1]).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getAllByRole('button', { name: 'Test' })[0]);
    await waitFor(() => expect(firstTestRequests).toBe(2));

    secondTest.resolve({ ok: true });
    firstTest.resolve({ ok: true });

    latestFirstTest.resolve({ ok: true });
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Test' })[0]).not.toHaveAttribute('aria-disabled', 'true'),
    );
  });

  it('renders community for an installed plugin until its npm classification is available', () => {
    hoisted.plugins = [makePlugin({ name: '@attraccess/plugin-shelly' })];
    const installedResponse = {
      ok: true,
      json: async () => [
        {
          name: '@attraccess/plugin-shelly',
          version: '1.0.0',
          classification: 'official',
          classificationReason: 'Published by Attraccess on npm',
        },
      ],
    };
    const marketplaceResponse = { ok: true, json: async () => ({ results: [], errors: [] }) };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string } | string) =>
        Promise.resolve(
          (typeof input === 'string' ? input : input.url)?.includes('/api/plugins/installed')
            ? installedResponse
            : marketplaceResponse,
        ),
      ),
    );

    render(<PluginsSection />);

    expect(document.querySelector('[data-cy="plugin-classification-community"]')).toBeInTheDocument();
  });

  it('reports registry search failures alongside partial marketplace results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], errors: ['Could not search Private'] }),
      }),
    );

    const user = userEvent.setup();
    render(<PluginsSection />);
    await openMarketplace(user);

    await waitFor(() =>
      expect(hoisted.errorToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Could not search Private' }),
      ),
    );
  });

  it('opens package details in the marketplace and returns to the catalog', async () => {
    const plugin = (name: string) => ({
      name,
      version: '1.0.0',
      displayName: name,
      description: null,
      permissions: [],
      registry: { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org' },
      classification: 'community' as const,
      classificationReason: 'Unapproved source',
      installable: true,
      incompatibilityReason: null,
    });
    const fetchMock = vi.fn((input: { url?: string } | string) => {
      const url = typeof input === 'string' ? input : (input.url ?? '');
      if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.includes('/marketplace/search'))
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [plugin('First'), plugin('Second')], errors: [] }),
        });
      return Promise.resolve({ ok: true, json: async () => plugin('Second') });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PluginsSection />);
    await openMarketplace(user);

    await user.click((await screen.findAllByText('Second'))[1]);
    expect(await screen.findByRole('heading', { name: 'Second' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Plugin marketplace' })).toBeInTheDocument();
  });

  it('discards detail responses that arrive after closing the marketplace', async () => {
    const detail = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string } | string) => {
        const url = typeof input === 'string' ? input : (input.url ?? '');
        if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
        if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
        if (url.includes('/marketplace/search'))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: [
                {
                  name: '@attraccess/plugin-shelly',
                  version: '1.0.0',
                  displayName: 'Shelly',
                  permissions: [],
                  registry: { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org' },
                  classification: 'official',
                  classificationReason: 'Published by Attraccess on npm',
                  installable: true,
                  incompatibilityReason: null,
                },
              ],
              errors: [],
            }),
          });
        return detail.promise;
      }),
    );
    const user = userEvent.setup();
    render(<PluginsSection />);
    await openMarketplace(user);

    await user.click(await screen.findByText('Shelly'));
    await user.keyboard('{Escape}');
    detail.resolve({
      ok: true,
      json: async () => ({
        name: '@attraccess/plugin-shelly',
        version: '1.0.0',
        displayName: 'Shelly',
        permissions: [],
        registry: { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org' },
        classification: 'official',
        classificationReason: 'Published by Attraccess on npm',
        installable: true,
        incompatibilityReason: null,
      }),
    });
    await openMarketplace(user);

    expect(await screen.findByRole('heading', { name: 'Plugin marketplace' })).toBeInTheDocument();
    expect(screen.queryByText('About this plugin')).not.toBeInTheDocument();
  });

  it('opens details when a debounced search starts after the details click', async () => {
    const detail = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const plugin = {
      name: '@attraccess-plugins/shelly',
      version: '1.0.0',
      displayName: 'Shelly',
      description: null,
      permissions: [],
      registry: { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org' },
      classification: 'official' as const,
      classificationReason: 'Approved Attraccess package source',
      installable: true,
      incompatibilityReason: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string } | string) => {
        const url = typeof input === 'string' ? input : (input.url ?? '');
        if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
        if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
        if (url.includes('/marketplace/search'))
          return Promise.resolve({ ok: true, json: async () => ({ results: [plugin], errors: [] }) });
        return detail.promise;
      }),
    );
    const user = userEvent.setup();
    render(<PluginsSection />);
    await openMarketplace(user);

    await user.type(screen.getByLabelText('Search plugins'), 's');
    await user.click(await screen.findByText('Shelly'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    detail.resolve({ ok: true, json: async () => plugin });

    expect(await screen.findByText('About this plugin')).toBeInTheDocument();
  });

  it('keeps the marketplace loading indicator visible while details are pending after a search completes', async () => {
    const detail = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const refreshedSearch = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const plugin = {
      name: '@attraccess-plugins/shelly',
      version: '1.0.0',
      displayName: 'Shelly',
      description: null,
      permissions: [],
      registry: { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org' },
      classification: 'official' as const,
      classificationReason: 'Approved Attraccess package source',
      installable: true,
      incompatibilityReason: null,
    };
    let searches = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string } | string) => {
        const url = typeof input === 'string' ? input : (input.url ?? '');
        if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
        if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
        if (url.includes('/marketplace/search')) {
          searches += 1;
          return searches === 1
            ? Promise.resolve({ ok: true, json: async () => ({ results: [plugin], errors: [] }) })
            : refreshedSearch.promise;
        }
        return detail.promise;
      }),
    );
    const user = userEvent.setup();
    render(<PluginsSection />);
    await openMarketplace(user);

    await user.click(await screen.findByText('Shelly'));
    await user.type(screen.getByLabelText('Search plugins'), 's');
    await new Promise((resolve) => setTimeout(resolve, 350));
    refreshedSearch.resolve({ ok: true, json: async () => ({ results: [plugin], errors: [] }) });

    expect(await screen.findByText('Searching plugins...')).toBeInTheDocument();
    detail.resolve({ ok: true, json: async () => plugin });
  });

  it('shows a plugin load error in a modal', async () => {
    hoisted.plugins = [makePlugin({ status: 'error', error: "Cannot find module '@nestjs/common'" })];
    const user = userEvent.setup();
    render(<PluginsSection />);

    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    expect(screen.queryByText("Cannot find module '@nestjs/common'")).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View load error for Cool Plugin' }));

    expect(await screen.findByRole('heading', { name: 'Cool Plugin failed to load' })).toBeInTheDocument();
    expect(screen.getByText("Cannot find module '@nestjs/common'")).toBeInTheDocument();
  });

  it('warns when plugins are globally disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string } | string) => {
        const url = typeof input === 'string' ? input : (input.url ?? '');
        if (url.endsWith('/api/plugins/status'))
          return Promise.resolve({ ok: true, json: async () => ({ disabled: true }) });
        if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
        if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
        return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
      }),
    );
    render(<PluginsSection />);

    expect(await screen.findByText('Plugins are disabled')).toBeInTheDocument();
  });

  it('marks a successfully loaded plugin', () => {
    hoisted.plugins = [makePlugin({ status: 'loaded', error: null })];
    render(<PluginsSection />);

    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });

  it('shows the empty state when no plugins are installed', () => {
    render(<PluginsSection />);

    expect(screen.getByText('No entries found')).toBeInTheDocument();
  });

  it('renders a row per plugin with name, version, directory and permission chips', () => {
    hoisted.plugins = [makePlugin()];
    render(<PluginsSection />);

    expect(screen.getByText('Cool Plugin')).toBeInTheDocument();
    expect(screen.getByText('1.2.3')).toBeInTheDocument();
    expect(screen.getByText('/plugins/cool')).toBeInTheDocument();
    expect(screen.getByText('read:resources')).toBeInTheDocument();
    expect(screen.getByText('write:resources')).toBeInTheDocument();
  });

  it('falls back to a dash for a missing directory and "None requested" for no permissions', () => {
    hoisted.plugins = [makePlugin({ pluginDirectory: '', permissions: [] })];
    render(<PluginsSection />);

    expect(screen.getAllByText('-')).toHaveLength(2);
    expect(screen.getByText('None requested')).toBeInTheDocument();
  });

  it('opens the upload drawer when the upload button is pressed', async () => {
    const user = userEvent.setup();
    render(<PluginsSection />);

    expect(document.querySelector('[data-cy="upload-plugin-modal"]')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Install plugin' }));
    await user.click(screen.getByText('Upload ZIP file'));

    await waitFor(() => expect(document.querySelector('[data-cy="upload-plugin-modal"]')).toBeInTheDocument());
  });

  it('opens the delete confirmation modal when a delete button is pressed', async () => {
    hoisted.plugins = [makePlugin()];
    const user = userEvent.setup();
    render(<PluginsSection />);

    await user.click(document.querySelector('[data-cy="plugins-list-delete-plugin-button-plugin-1"]') as Element);

    await waitFor(() =>
      expect(document.querySelector('[data-cy="plugins-list-delete-confirmation-delete-button"]')).toBeInTheDocument(),
    );
  });

  it('calls deletePlugin with the plugin id when deletion is confirmed', async () => {
    hoisted.plugins = [makePlugin()];
    const user = userEvent.setup();
    render(<PluginsSection />);

    await user.click(document.querySelector('[data-cy="plugins-list-delete-plugin-button-plugin-1"]') as Element);
    const confirm = await waitFor(() =>
      document.querySelector('[data-cy="plugins-list-delete-confirmation-delete-button"]'),
    );
    await user.click(confirm as Element);

    expect(hoisted.deleteMutateMock).toHaveBeenCalledWith({ pluginId: 'plugin-1' });
  });

  it('shows a success toast after a successful delete', () => {
    // The success handler also schedules a full page reload; fake timers keep that out of the test.
    vi.useFakeTimers();
    hoisted.plugins = [makePlugin()];
    render(<PluginsSection />);

    hoisted.deleteOptions?.onSuccess?.();

    expect(hoisted.successToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Plugin removed' }));
    vi.useRealTimers();
  });

  it('shows an error toast when the delete fails', () => {
    hoisted.plugins = [makePlugin()];
    render(<PluginsSection />);

    hoisted.deleteOptions?.onError?.(new Error('boom'));

    expect(hoisted.errorToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not remove the plugin' }));
  });

  it('cancels the delete without calling the mutation', async () => {
    hoisted.plugins = [makePlugin()];
    const user = userEvent.setup();
    render(<PluginsSection />);

    await user.click(document.querySelector('[data-cy="plugins-list-delete-plugin-button-plugin-1"]') as Element);
    const cancel = await waitFor(() =>
      document.querySelector('[data-cy="plugins-list-delete-confirmation-cancel-button"]'),
    );
    await user.click(cancel as Element);

    expect(hoisted.deleteMutateMock).not.toHaveBeenCalled();
  });

  it('renders permission chips scoped to the plugin row', () => {
    hoisted.plugins = [makePlugin({ id: 'p-perms', permissions: ['admin'] })];
    render(<PluginsSection />);

    const container = document.querySelector('[data-cy="plugins-list-permissions-p-perms"]') as HTMLElement;
    expect(container).toBeInTheDocument();
    expect(within(container).getByText('admin')).toBeInTheDocument();
  });
});
