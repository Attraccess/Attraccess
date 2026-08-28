import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
        name: '@attraccess-plugins/shelly',
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
        classificationReason: 'Approved Attraccess package source',
        installable: true,
        incompatibilityReason: null,
        integrity: 'sha512-test',
        provenance: 'npm (attraccess)',
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
  it('renders the section heading, upload button and table headers', () => {
    render(<PluginsSection />);

    expect(screen.getByRole('heading', { name: 'Plugins' })).toBeInTheDocument();
    expect(screen.getByText('Upload plugin')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Version')).toBeInTheDocument();
    expect(screen.getByText('Directory')).toBeInTheDocument();
    expect(screen.getByText('Permissions')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders the official marketplace classification', async () => {
    render(<PluginsSection />);

    expect(await screen.findByText('Shelly')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Official plugins' })).toBeInTheDocument();
    expect(screen.getByText('Official')).toBeInTheDocument();
    expect(screen.getByText('Version: 1.0.0')).toBeInTheDocument();
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
    render(<PluginsSection />);

    expect(await screen.findByText('Plugin is not compatible with Attraccess 1.0.0')).toBeInTheDocument();
  });

  it('requires source and permission acknowledgement before installing', async () => {
    const user = userEvent.setup();
    render(<PluginsSection />);

    await user.click(await screen.findByRole('button', { name: 'Details' }));
    await user.click(screen.getByRole('button', { name: 'Install' }));

    const confirm = screen.getByRole('button', { name: 'Install plugin' });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(confirm).toBeEnabled();
    expect(
      screen.getByText('Installing this plugin requires an application restart to activate it.'),
    ).toBeInTheDocument();
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
      vi.fn((input: { url?: string } | string, init?: { method?: string }) => {
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
      vi.fn((input: { url?: string } | string, init?: { method?: string }) => {
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

    await user.click(screen.getByText('Manage registries'));
    await user.type(screen.getByLabelText('Registry name'), 'Private');
    await user.type(screen.getByLabelText('Registry URL'), 'https://packages.example.test/npm');
    await user.click(screen.getByRole('button', { name: 'Add registry' }));

    await waitFor(() => expect(hoisted.errorToast).toHaveBeenCalled());
    expect(hoisted.successToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Registry added.' }));
  });

  it('renders community for an installed plugin until its npm classification is available', () => {
    hoisted.plugins = [makePlugin({ name: '@attraccess-plugins/shelly' })];
    const installedResponse = {
      ok: true,
      json: async () => [
        {
          name: '@attraccess-plugins/shelly',
          version: '1.0.0',
          classification: 'official',
          classificationReason: 'Approved Attraccess package source',
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

    render(<PluginsSection />);

    await waitFor(() =>
      expect(hoisted.errorToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Could not search Private' }),
      ),
    );
  });

  it('keeps the most recently opened marketplace plugin details', async () => {
    const first = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const second = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
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
      return url.includes('First') ? first.promise : second.promise;
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PluginsSection />);

    const detailButtons = await screen.findAllByRole('button', { name: 'Details' });
    await user.click(detailButtons[0]);
    await user.click(detailButtons[1]);
    second.resolve({ ok: true, json: async () => plugin('Second') });
    expect(await screen.findByRole('heading', { name: 'Second details' })).toBeInTheDocument();
    first.resolve({ ok: true, json: async () => plugin('First') });

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Second details' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'First details' })).not.toBeInTheDocument();
  });

  it('flags a plugin whose backend failed to load', () => {
    hoisted.plugins = [makePlugin({ status: 'error', error: "Cannot find module '@nestjs/common'" })];
    render(<PluginsSection />);

    expect(screen.getByText('Failed to load')).toBeInTheDocument();
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

    await user.click(screen.getByText('Upload plugin'));

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
