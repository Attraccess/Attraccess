import '@testing-library/jest-dom/vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
// Register the shared API mocks before loading the component's feature modules.
import { deferred, hoisted, renderWithQuery, pickRegistry } from './index.test.hoisted';
import { PluginsSection } from './index';

const LOAD_ERROR = 'Could not load the marketplace.';
const REGISTRY_LOAD_ERROR = 'Could not load configured registries.';
const privateRegistry = {
  id: 'private',
  name: 'Private',
  url: 'https://packages.example.test',
  tokenConfigured: false,
};

const respond = (data: unknown) => Promise.resolve({ ok: true, json: async () => data });
const listed = (name: string, registry = privateRegistry) => ({
  name,
  version: '1.0.0',
  displayName: name,
  permissions: [],
  registry,
  classification: 'community',
  installable: true,
});
const callsTo = (fragment: string) => hoisted.apiMock.mock.calls.filter(([path]) => path.includes(fragment));
const titled = (title: string) => hoisted.errorToast.mock.calls.filter(([toast]) => toast.title === title);

async function openMarketplace(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Install plugin' }));
  await user.click(screen.getByText('Browse marketplace'));
}

describe('PluginsSection marketplace', () => {
  it('reports a failed registry load once and does not load or report it again when the marketplace reopens', async () => {
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: false });
      return respond(url.includes('/marketplace/search') ? { results: [], errors: [] } : []);
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);
    await waitFor(() => expect(hoisted.errorToast).toHaveBeenCalledWith({ title: REGISTRY_LOAD_ERROR }));

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Plugin marketplace' })).not.toBeInTheDocument());
    await openMarketplace(user);
    await user.click(screen.getByText('Manage registries'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(callsTo('/api/plugins/registries')).toHaveLength(1);
    expect(titled(REGISTRY_LOAD_ERROR)).toHaveLength(1);
  });

  it('loads the installed packages and registries again on the next visit of the section', async () => {
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: false });
      return respond([]);
    });
    const firstVisit = renderWithQuery(<PluginsSection />);
    await waitFor(() => expect(titled(REGISTRY_LOAD_ERROR)).toHaveLength(1));
    expect(callsTo('/api/plugins/installed')).toHaveLength(1);
    firstVisit.unmount();
    // Let the dropped queries be garbage-collected before the next visit.
    await new Promise((resolve) => setTimeout(resolve, 10));

    renderWithQuery(<PluginsSection />);
    await waitFor(() => expect(titled(REGISTRY_LOAD_ERROR)).toHaveLength(2));
    expect(callsTo('/api/plugins/registries')).toHaveLength(2);
    expect(callsTo('/api/plugins/installed')).toHaveLength(2);
  });

  it('reports a failed search without a description when no package was found directly', async () => {
    hoisted.apiMock.mockImplementation((url: string) =>
      url.includes('/marketplace/search') ? Promise.resolve({ ok: false }) : respond([]),
    );
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await waitFor(() => expect(hoisted.errorToast).toHaveBeenCalledWith({ title: LOAD_ERROR }));
  });

  it('does not report a failed search when the selected registry has the typed package', async () => {
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/registries')) return respond([privateRegistry]);
      if (url.includes('/marketplace/search'))
        return url.includes('registryId=private')
          ? Promise.resolve({ ok: false })
          : respond({ results: [], errors: [] });
      if (url.includes('/marketplace/')) return respond(listed('@private/plugin'));
      return respond([]);
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await user.type(screen.getByLabelText('Search plugins'), '@private/plugin');
    await pickRegistry(user, 'Private');

    expect(await screen.findByText('@private/plugin', { selector: 'h3' })).toBeInTheDocument();
    await waitFor(() => expect(callsTo('search?query=%40private%2Fplugin&registryId=private')).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(titled(LOAD_ERROR)).toHaveLength(0);
  });

  it('keeps search results apart per registry', async () => {
    const npm = { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org', tokenConfigured: false };
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/registries')) return respond([privateRegistry]);
      if (url.includes('/marketplace/search')) return respond({ results: [listed('first', npm)], errors: [] });
      if (url.includes('/marketplace/')) return respond(listed('first'));
      return respond([]);
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await pickRegistry(user, 'Private');
    await user.type(screen.getByLabelText('Search plugins'), 'first');

    await waitFor(() => expect(screen.getAllByText('first', { selector: 'h3' })).toHaveLength(2));
    expect(screen.getByText('npm · -')).toBeInTheDocument();
    expect(screen.getByText('Private · -')).toBeInTheDocument();
  });

  it('shows only the latest search results when an earlier search responds last', async () => {
    const searchA = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const searchAb = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('search?query=a')) return searchA.promise;
      if (url.endsWith('search?query=ab')) return searchAb.promise;
      return respond(url.includes('/marketplace/search') ? { results: [], errors: [] } : []);
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    const search = screen.getByLabelText('Search plugins');
    await user.type(search, 'a');
    await waitFor(() => expect(callsTo('search?query=a')).toHaveLength(1));
    await user.type(search, 'b');
    await waitFor(() => expect(callsTo('search?query=ab')).toHaveLength(1));
    searchAb.resolve({ ok: true, json: async () => ({ results: [listed('AB')], errors: [] }) });
    expect(await screen.findByText('AB', { selector: 'h3' })).toBeInTheDocument();
    searchA.resolve({ ok: true, json: async () => ({ results: [listed('A')], errors: [] }) });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByText('AB', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.queryByText('A', { selector: 'h3' })).not.toBeInTheDocument();
  });

  it('does not report the failure of a search the admin has already typed past', async () => {
    const searchA = deferred<{ ok: boolean; json?: () => Promise<unknown> }>();
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('search?query=a')) return searchA.promise;
      if (url.endsWith('search?query=ab')) return respond({ results: [listed('AB')], errors: [] });
      return respond(url.includes('/marketplace/search') ? { results: [], errors: [] } : []);
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    const search = screen.getByLabelText('Search plugins');
    await user.type(search, 'a');
    await waitFor(() => expect(callsTo('search?query=a')).toHaveLength(1));
    await user.type(search, 'b');
    // The earlier search fails while the newer query still waits for its debounce.
    searchA.resolve({ ok: false });

    expect(await screen.findByText('AB', { selector: 'h3' })).toBeInTheDocument();
    expect(titled(LOAD_ERROR)).toHaveLength(0);
  });

  it('refreshes the registries after removing the selected one and searches all registries again', async () => {
    let registries = [privateRegistry];
    hoisted.removeRegistryMock.mockImplementation(async () => {
      registries = [];
    });
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/registries')) return respond(registries);
      return respond(url.includes('/marketplace/search') ? { results: [], errors: [] } : []);
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await pickRegistry(user, 'Private');
    await waitFor(() => expect(callsTo('registryId=private')).toHaveLength(1));
    await user.click(screen.getByText('Manage registries'));
    const callsBeforeRemoval = hoisted.apiMock.mock.calls.length;
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(hoisted.removeRegistryMock).toHaveBeenCalledWith({ path: { registryId: 'private' } });
    await waitFor(() => expect(screen.queryByText(/Private · .* · No token/)).not.toBeInTheDocument());
    expect(screen.queryByRole('option', { name: 'Private' })).not.toBeInTheDocument();
    const laterPaths = hoisted.apiMock.mock.calls.slice(callsBeforeRemoval).map(([path]) => path);
    expect(laterPaths).toContain('/api/plugins/registries');
    await waitFor(() =>
      expect(hoisted.apiMock.mock.calls.slice(callsBeforeRemoval).map(([path]) => path)).toContain(
        '/api/plugins/marketplace/search?query=',
      ),
    );
  });

  it('reports a rejected registry removal and keeps the registry', async () => {
    hoisted.removeRegistryMock.mockRejectedValue(new Error('Registry is in use'));
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/registries')) return respond([privateRegistry]);
      return respond(url.includes('/marketplace/search') ? { results: [], errors: [] } : []);
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await user.click(screen.getByText('Manage registries'));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(hoisted.errorToast).toHaveBeenCalledWith({ title: 'Could not remove the registry.' }));
    expect(screen.getByText(/Private · .* · No token/)).toBeInTheDocument();
  });

  it('keeps the registry form and a running registry save when package details open and close', async () => {
    const save = deferred<object>();
    hoisted.addRegistryMock.mockReturnValue(save.promise);
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/registries')) return respond([]);
      if (url.includes('/marketplace/search')) return respond({ results: [listed('Listed')], errors: [] });
      if (url.includes('/marketplace/')) return respond(listed('Listed'));
      return respond([]);
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await user.click(screen.getByText('Manage registries'));
    await user.type(screen.getByLabelText('Registry name'), 'Draft');
    await user.click(await screen.findByText('Listed', { selector: 'h3' }));
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    await user.click(screen.getByText('Manage registries'));
    expect(screen.getByLabelText('Registry name')).toHaveValue('Draft');

    await user.type(screen.getByLabelText('Registry URL'), 'https://draft.example.test');
    await user.click(screen.getByRole('button', { name: 'Add registry' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Plugin marketplace' })).not.toBeInTheDocument());
    await openMarketplace(user);
    await user.click(screen.getByText('Manage registries'));
    expect(screen.getByRole('button', { name: 'Add registry' })).toHaveAttribute('data-pending', 'true');

    save.resolve({});
    await waitFor(() => expect(hoisted.successToast).toHaveBeenCalledWith({ title: 'Registry added.' }));
    expect(screen.getByLabelText('Registry name')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Add registry' })).not.toHaveAttribute('data-pending', 'true');
  });
});
