import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
// Register the shared API mocks before loading the component's feature modules.
import { chooseRowAction, deferred, hoisted, makePlugin, renderWithQuery } from './index.test.hoisted';
import { PluginsSection } from './index';

import { describe } from 'vitest';
describe('PluginsSection', () => {
  it('renders the section heading, install menu and table headers', () => {
    renderWithQuery(<PluginsSection />);

    expect(screen.getByRole('heading', { name: 'Plugins' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install plugin' })).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Version')).toBeInTheDocument();
    expect(screen.getByText('Directory')).toBeInTheDocument();
    expect(screen.getByText('Permissions')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('uses the full content width and offers the plugin docs in the toolbar instead of an aside', () => {
    const { container } = renderWithQuery(<PluginsSection />);

    expect(container.querySelector('[data-slot="settings-aside"]')).toBeNull();
    expect(container.querySelector('[data-slot="settings-content"]')).not.toHaveClass('max-w-2xl');
    const docs = screen.getByRole('link', { name: 'Documentation' });
    expect(docs).toHaveAttribute('data-cy', 'plugins-list-docs-link');
    expect(docs).toHaveAttribute('href', 'https://docs.attraccess.org/#/plugins/developing-plugins');
    expect(docs).toHaveAttribute('target', '_blank');
    expect(docs).toHaveAttribute('rel', 'noreferrer');
  });

  it('collects the row actions of a registry-installed plugin in one named menu', async () => {
    hoisted.plugins = [makePlugin()];
    hoisted.apiMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          url.endsWith('/api/plugins/installed')
            ? [
                {
                  name: 'Cool Plugin',
                  version: '1.2.3',
                  installPath: '/plugins/cool',
                  registryId: 'npm',
                  registryUrl: 'https://registry.example.org',
                },
              ]
            : [],
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    expect((await screen.findAllByText('https://registry.example.org')).length).toBeGreaterThan(0);
    const trigger = screen.getByRole('button', { name: 'Actions for Cool Plugin' });
    expect(trigger).toHaveAttribute('data-cy', 'plugins-list-actions-button-plugin-1');
    await user.click(trigger);
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Details', 'Manage version', 'Remove plugin']);
    expect(items.map((item) => item.getAttribute('data-cy'))).toEqual([
      'plugins-list-details-button-plugin-1',
      'plugins-list-manage-version-button-plugin-1',
      'plugins-list-delete-plugin-button-plugin-1',
    ]);
  });

  it('offers only removal for a plugin that was not installed from a registry', async () => {
    hoisted.plugins = [makePlugin()];
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    await user.click(screen.getByRole('button', { name: 'Actions for Cool Plugin' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Remove plugin']);
    // HeroUI's danger variant colours only the item's label slot: plain text would stay in the default colour.
    expect(items[0].querySelector('[data-slot="label"]')).toHaveTextContent('Remove plugin');
  });

  it('returns focus to the row actions trigger when its menu closes', async () => {
    hoisted.plugins = [makePlugin()];
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    const trigger = screen.getByRole('button', { name: 'Actions for Cool Plugin' });
    await user.click(trigger);
    await screen.findAllByRole('menuitem');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('checks marketplace plugins for updates and takes the admin to the in-place update flow', async () => {
    hoisted.plugins = [makePlugin()];
    const installed = {
      name: 'Cool Plugin',
      version: '1.2.3',
      registryId: 'npm',
      registryUrl: 'https://registry.npmjs.org',
      classification: 'community',
      classificationReason: 'Marketplace package',
      requestedSpec: 'latest',
      updateOverride: 'inherit',
    };
    const checked = {
      ...installed,
      updateCheck: {
        checkedAt: '2026-09-21T12:00:00.000Z',
        candidate: '1.2.4',
        state: 'available',
        error: null,
      },
    };
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [installed] });
      if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/api/plugins/installed/Cool%20Plugin/versions'))
        return Promise.resolve({
          ok: true,
          json: async () => [
            { version: '1.2.3', direction: 'current', compatible: true },
            { version: '1.2.4', direction: 'newer', compatible: true },
          ],
        });
      return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
    });
    hoisted.checkAllInstalledPackagesMock.mockResolvedValue([checked]);
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    await user.click(await screen.findByRole('button', { name: 'Check all now' }));
    expect(await screen.findByText('Plugin updates are available')).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 installed marketplace plugin can be updated. Review the available version before applying it.',
      ),
    ).toBeInTheDocument();
    expect(hoisted.checkAllInstalledPackagesMock).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Review updates' }));
    expect(await screen.findByRole('heading', { name: 'Manage Cool Plugin version' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '1.2.4 Newer' })).toBeInTheDocument();
  });

  it('reports failed package update checks', async () => {
    hoisted.plugins = [makePlugin()];
    const installed = {
      name: 'Cool Plugin',
      version: '1.2.3',
      registryId: 'npm',
      registryUrl: 'https://registry.npmjs.org',
      classification: 'community',
      classificationReason: 'Marketplace package',
      requestedSpec: 'latest',
      updateOverride: 'inherit',
    };
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [installed] });
      if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
    });
    hoisted.checkAllInstalledPackagesMock.mockResolvedValue([
      {
        ...installed,
        updateCheck: {
          checkedAt: '2026-09-22T12:00:00.000Z',
          candidate: null,
          state: 'failed',
          error: 'Registry unavailable',
        },
      },
    ]);
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    await user.click(await screen.findByRole('button', { name: 'Check all now' }));

    await waitFor(() => expect(hoisted.errorToast).toHaveBeenCalledWith({ title: 'Could not check plugin updates' }));
    expect(hoisted.successToast).not.toHaveBeenCalled();
  });

  async function openMarketplace(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Install plugin' }));
    await user.click(screen.getByText('Browse marketplace'));
  }

  it('renders the official marketplace classification', async () => {
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    expect(await screen.findByText('Example')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Official plugins' })).toBeInTheDocument();
    expect(screen.getByText('Official')).toBeInTheDocument();
    expect(screen.getByText('Version: 1.0.0')).toBeInTheDocument();
  });

  it('closes the marketplace with its Cancel button', async () => {
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('heading', { name: 'Plugin marketplace' })).not.toBeInTheDocument();
  });

  it('uses exact package lookup when a selected registry cannot be searched', async () => {
    const user = userEvent.setup();
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
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
    });
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await user.selectOptions(screen.getByLabelText('Registry'), 'private');
    await user.type(screen.getByLabelText('Search plugins'), '@private/plugin');

    expect(await screen.findByText('Private plugin')).toBeInTheDocument();
  });

  it.each([
    ['adds an exact package lookup to the search results', ['second']],
    ['does not duplicate an exact package lookup the search already found', ['first', 'second']],
  ])('%s', async (_case, searchResults) => {
    const user = userEvent.setup();
    const listed = (name: string) => ({
      name,
      version: '1.0.0',
      displayName: name,
      permissions: [],
      registry: { id: 'private', name: 'Private', url: 'https://packages.example.com' },
      classification: 'community',
      installable: true,
    });
    hoisted.apiMock.mockImplementation((url: string) => {
      const respond = (data: unknown) => Promise.resolve({ ok: true, json: async () => data });
      if (url.includes('/api/plugins/installed')) return respond([]);
      if (url.endsWith('/api/plugins/registries'))
        return respond([{ id: 'private', name: 'Private', url: 'https://packages.example.com' }]);
      if (url.includes('/marketplace/search')) return respond({ results: searchResults.map(listed), errors: [] });
      return respond(listed('first'));
    });
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await user.selectOptions(screen.getByLabelText('Registry'), 'private');
    await user.type(screen.getByLabelText('Search plugins'), 'first');

    await waitFor(() =>
      expect(hoisted.apiMock).toHaveBeenCalledWith('/api/plugins/marketplace/first?registryId=private'),
    );
    await waitFor(() => expect(screen.queryByText('Searching plugins...')).not.toBeInTheDocument());
    expect(screen.getAllByText('first', { selector: 'h3' })).toHaveLength(1);
    expect(screen.getAllByText('second', { selector: 'h3' })).toHaveLength(1);
  });

  it('keeps incompatible marketplace packages visible with their reason', async () => {
    hoisted.apiMock.mockImplementation((url: string) => {
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
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    expect(await screen.findByText('Plugin is not compatible with Attraccess 1.0.0')).toBeInTheDocument();
  });

  it('requires source and permission acknowledgement before installing', async () => {
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await user.click(await screen.findByText('Example'));
    await user.click(screen.getByRole('button', { name: 'Install' }));

    const installDialog = screen.getByRole('heading', { name: 'Install Example?' }).closest('[role="dialog"]');
    expect(installDialog).not.toBeNull();
    const confirm = within(installDialog as HTMLElement).getByRole('button', { name: 'Install plugin' });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(confirm).toBeEnabled();
    expect(
      screen.getByText('Installing this plugin requires an application restart to activate it.'),
    ).toBeInTheDocument();
  });

  it.each(['Cancel button', 'Escape key'])(
    'discards the install acknowledgement when the confirmation is dismissed with the %s',
    async (dismissal) => {
      const user = userEvent.setup();
      renderWithQuery(<PluginsSection />);
      await openMarketplace(user);
      await user.click(await screen.findByText('Example'));

      await user.click(screen.getByRole('button', { name: 'Install' }));
      const dialog = screen
        .getByRole('heading', { name: 'Install Example?' })
        .closest('[role="dialog"]') as HTMLElement;
      await user.click(within(dialog).getByRole('checkbox'));
      expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeEnabled();
      if (dismissal === 'Cancel button') await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      else await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Install Example?' })).not.toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Install' }));
      const reopened = (await screen.findByRole('heading', { name: 'Install Example?' })).closest(
        '[role="dialog"]',
      ) as HTMLElement;
      expect(within(reopened).getByRole('checkbox')).not.toBeChecked();
      expect(within(reopened).getByRole('button', { name: 'Install plugin' })).toBeDisabled();
      expect(hoisted.installPackageMock).not.toHaveBeenCalled();
    },
  );

  it('installs an exact private package version from its selected registry', async () => {
    const user = userEvent.setup();
    hoisted.apiMock.mockImplementation((url: string) => {
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
    renderWithQuery(<PluginsSection />);
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
      expect(hoisted.installPackageMock).toHaveBeenCalledWith({
        path: { packageName: '@private/plugin', version: '2.3.4' },
        body: { registryId: 'private' },
      }),
    );
  });

  it('keeps the install failure and compatibility remedy visible in the install confirmation modal', async () => {
    hoisted.installPackageMock.mockRejectedValue({
      status: 400,
      body: { message: 'Plugin is not compatible with Attraccess 1.9.0' },
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);
    await user.click(await screen.findByText('Example'));
    await user.click(await screen.findByRole('button', { name: 'Install' }));
    await user.click(screen.getByRole('checkbox'));
    const dialog = screen.getByRole('heading', { name: 'Install Example?' }).closest('[role="dialog"]');
    expect(dialog).not.toBeNull();
    await user.click(within(dialog as HTMLElement).getByRole('button', { name: 'Install plugin' }));

    expect(
      await within(dialog as HTMLElement).findByText(/Plugin is not compatible with Attraccess 1.9.0/),
    ).toBeInTheDocument();
    expect(within(dialog as HTMLElement).getByText(/Choose a plugin version compatible/)).toBeInTheDocument();
    expect(within(dialog as HTMLElement).getByRole('button', { name: 'Install plugin' })).toBeEnabled();
  });

  it('shows only the configured state for registry tokens', async () => {
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/registries'))
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 'private', name: 'Private', url: 'https://packages.example.test/npm', tokenConfigured: true },
          ],
        });
      if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await user.click(screen.getByText('Manage registries'));
    expect(await screen.findByText(/Private.*Token configured/)).toBeInTheDocument();
    expect(screen.getByLabelText('Access token (write-only)')).toHaveAttribute('type', 'password');
  });

  it('keeps the latest registry refresh when an earlier load completes late', async () => {
    const initial = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const refreshed = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    let registryLoads = 0;
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/registries')) {
        registryLoads += 1;
        return registryLoads === 1 ? initial.promise : refreshed.promise;
      }
      if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
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
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/registries')) {
        registryLoads += 1;
        return Promise.resolve(registryLoads === 1 ? { ok: true, json: async () => [] } : { ok: false });
      }
      if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
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
    hoisted.testRegistryMock.mockImplementation(({ path: { registryId } }: { path: { registryId: string } }) => {
      if (registryId === 'first') {
        firstTestRequests += 1;
        return firstTestRequests === 1 ? firstTest.promise : latestFirstTest.promise;
      }
      return secondTest.promise;
    });
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/registries'))
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 'first', name: 'First', url: 'https://first.example.test', tokenConfigured: false },
            { id: 'second', name: 'Second', url: 'https://second.example.test', tokenConfigured: false },
          ],
        });
      if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
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
    hoisted.plugins = [makePlugin({ name: '@attraccess/plugin-example' })];
    const installedResponse = {
      ok: true,
      json: async () => [
        {
          name: '@attraccess/plugin-example',
          version: '1.0.0',
          classification: 'official',
          classificationReason: 'Published by Attraccess on npm',
        },
      ],
    };
    const marketplaceResponse = { ok: true, json: async () => ({ results: [], errors: [] }) };
    hoisted.apiMock.mockImplementation((url: string) =>
      Promise.resolve(url.includes('/api/plugins/installed') ? installedResponse : marketplaceResponse),
    );

    renderWithQuery(<PluginsSection />);

    expect(document.querySelector('[data-cy="plugin-classification-community"]')).toBeInTheDocument();
  });

  it('reports registry search failures alongside partial marketplace results', async () => {
    hoisted.apiMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          url.endsWith('/api/plugins/installed') || url.endsWith('/api/plugins/registries')
            ? []
            : { results: [], errors: ['Could not search Private'] },
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
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
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.includes('/marketplace/search'))
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [plugin('First'), plugin('Second')], errors: [] }),
        });
      return Promise.resolve({ ok: true, json: async () => plugin('Second') });
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await user.click((await screen.findAllByText('Second'))[1]);
    expect(await screen.findByRole('heading', { name: 'Second' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Plugin marketplace' })).toBeInTheDocument();
  });

  it('discards detail responses that arrive after closing the marketplace', async () => {
    const detail = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.includes('/marketplace/search'))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              {
                name: '@attraccess/plugin-example',
                version: '1.0.0',
                displayName: 'Example',
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
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await user.click(await screen.findByText('Example'));
    await user.keyboard('{Escape}');
    detail.resolve({
      ok: true,
      json: async () => ({
        name: '@attraccess/plugin-example',
        version: '1.0.0',
        displayName: 'Example',
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
      name: '@attraccess-plugins/example',
      version: '1.0.0',
      displayName: 'Example',
      description: null,
      permissions: [],
      registry: { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org' },
      classification: 'official' as const,
      classificationReason: 'Approved Attraccess package source',
      installable: true,
      incompatibilityReason: null,
    };
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.includes('/marketplace/search'))
        return Promise.resolve({ ok: true, json: async () => ({ results: [plugin], errors: [] }) });
      return detail.promise;
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await user.type(screen.getByLabelText('Search plugins'), 's');
    await user.click(await screen.findByText('Example'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    detail.resolve({ ok: true, json: async () => plugin });

    expect(await screen.findByText('About this plugin')).toBeInTheDocument();
  });

  it('keeps the marketplace loading indicator visible while details are pending after a search completes', async () => {
    const detail = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const refreshedSearch = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const plugin = {
      name: '@attraccess-plugins/example',
      version: '1.0.0',
      displayName: 'Example',
      description: null,
      permissions: [],
      registry: { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org' },
      classification: 'official' as const,
      classificationReason: 'Approved Attraccess package source',
      installable: true,
      incompatibilityReason: null,
    };
    let searches = 0;
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.includes('/marketplace/search')) {
        searches += 1;
        return searches === 1
          ? Promise.resolve({ ok: true, json: async () => ({ results: [plugin], errors: [] }) })
          : refreshedSearch.promise;
      }
      return detail.promise;
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await openMarketplace(user);

    await user.click(await screen.findByText('Example'));
    await user.type(screen.getByLabelText('Search plugins'), 's');
    await new Promise((resolve) => setTimeout(resolve, 350));
    refreshedSearch.resolve({ ok: true, json: async () => ({ results: [plugin], errors: [] }) });

    expect(await screen.findByText('Searching plugins...')).toBeInTheDocument();
    detail.resolve({ ok: true, json: async () => plugin });
  });

  it('shows a plugin load error in a modal', async () => {
    hoisted.plugins = [makePlugin({ status: 'error', error: "Cannot find module '@nestjs/common'" })];
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    expect(screen.queryByText("Cannot find module '@nestjs/common'")).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View load error for Cool Plugin' }));

    expect(await screen.findByRole('heading', { name: 'Cool Plugin failed to load' })).toBeInTheDocument();
    expect(screen.getByText("Cannot find module '@nestjs/common'")).toBeInTheDocument();
  });

  it('shows a missing license as a warning with only the missing modules and no load-error action', () => {
    hoisted.plugins = [
      makePlugin({
        status: 'license_missing',
        // The row renders its own translated text from missingLicenseModules, not the server's English error.
        error: 'server message',
        license: { required: true, modules: ['wago', 'other'] },
        missingLicenseModules: ['other'],
      }),
    ];
    renderWithQuery(<PluginsSection />);

    expect(screen.getByText('License missing')).toBeInTheDocument();
    expect(screen.getByText('Requires license module: other')).toBeInTheDocument();
    expect(screen.queryByText('server message')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View load error for Cool Plugin' })).not.toBeInTheDocument();
  });

  it('names every missing module when several are missing', () => {
    hoisted.plugins = [
      makePlugin({
        status: 'license_missing',
        error: 'server message',
        license: { required: true, modules: ['wago', 'reservations'] },
        missingLicenseModules: ['wago', 'reservations'],
      }),
    ];
    renderWithQuery(<PluginsSection />);

    expect(screen.getByText('Requires license modules: wago, reservations')).toBeInTheDocument();
  });

  it('names a valid license when a plugin needs no specific module', () => {
    hoisted.plugins = [
      makePlugin({
        status: 'license_missing',
        error: 'Requires a valid Attraccess license',
        license: { required: true },
        missingLicenseModules: [],
      }),
    ];
    renderWithQuery(<PluginsSection />);

    expect(screen.getByText('Requires a valid Attraccess license')).toBeInTheDocument();
  });

  it('warns when plugins are globally disabled', async () => {
    hoisted.pluginSystemStatus = { disabled: true, instanceId: 'original-instance' };
    renderWithQuery(<PluginsSection />);

    expect(await screen.findByText('Plugins are disabled')).toBeInTheDocument();
  });

  it('marks a successfully loaded plugin', () => {
    hoisted.plugins = [makePlugin({ status: 'loaded', error: null })];
    renderWithQuery(<PluginsSection />);

    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });

  it('retries a failed plugin when the restarted server becomes available without observing downtime', async () => {
    hoisted.statusRefetchMock
      .mockResolvedValueOnce({ data: { disabled: false, instanceId: 'original-instance' } })
      .mockResolvedValueOnce({ data: { disabled: false, instanceId: 'restarted-instance' } });
    hoisted.plugins = [makePlugin({ status: 'error', error: 'Plugin startup failed' })];
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    await user.click(screen.getByRole('button', { name: 'View load error for Cool Plugin' }));
    await user.click(screen.getByRole('button', { name: 'Retry and restart' }));

    await waitFor(() => expect(hoisted.retryMutateAsyncMock).toHaveBeenCalledWith({ path: { pluginId: 'plugin-1' } }));
    expect(hoisted.successToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'The plugin will be retried when the app restarts.' }),
    );
    await waitFor(() => expect(hoisted.statusRefetchMock).toHaveBeenCalledTimes(2));
    expect(hoisted.statusRefetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.retryMutateAsyncMock.mock.invocationCallOrder[0],
    );
  });

  it('keeps the retry action pending while it waits for the restarted server', async () => {
    const restartStatus = deferred<{ data: { disabled: boolean; instanceId: string } }>();
    hoisted.statusRefetchMock
      .mockResolvedValueOnce({ data: { disabled: false, instanceId: 'original-instance' } })
      .mockReturnValueOnce(restartStatus.promise);
    hoisted.plugins = [makePlugin({ status: 'error', error: 'Plugin startup failed' })];
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    await user.click(screen.getByRole('button', { name: 'View load error for Cool Plugin' }));
    await user.click(screen.getByRole('button', { name: 'Retry and restart' }));

    await waitFor(() => expect(hoisted.statusRefetchMock).toHaveBeenCalledTimes(2));
    expect(document.querySelector('[data-cy="plugins-list-retry-load-button"]')).toHaveAttribute(
      'data-pending',
      'true',
    );

    restartStatus.resolve({ data: { disabled: false, instanceId: 'restarted-instance' } });
    await waitFor(() => expect(hoisted.successToast).toHaveBeenCalled());
  });

  it('shows the empty state when no plugins are installed', () => {
    renderWithQuery(<PluginsSection />);

    expect(screen.getByText('No entries found')).toBeInTheDocument();
  });

  it('renders a row per plugin with name, version, directory and permission chips', () => {
    hoisted.plugins = [makePlugin()];
    renderWithQuery(<PluginsSection />);

    expect(screen.getByText('Cool Plugin')).toBeInTheDocument();
    expect(screen.getByText('1.2.3')).toBeInTheDocument();
    expect(screen.getByText('/plugins/cool')).toBeInTheDocument();
    expect(screen.getByText('read:resources')).toBeInTheDocument();
    expect(screen.getByText('write:resources')).toBeInTheDocument();
  });

  it('falls back to a dash for a missing directory and "None requested" for no permissions', () => {
    hoisted.plugins = [makePlugin({ pluginDirectory: '', permissions: [] })];
    renderWithQuery(<PluginsSection />);

    expect(screen.getAllByText('-')).toHaveLength(2);
    expect(screen.getByText('None requested')).toBeInTheDocument();
  });

  it('opens the upload drawer when the upload button is pressed', async () => {
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    expect(document.querySelector('[data-cy="upload-plugin-modal"]')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Install plugin' }));
    await user.click(screen.getByText('Upload ZIP file'));

    await waitFor(() => expect(document.querySelector('[data-cy="upload-plugin-modal"]')).toBeInTheDocument());
  });

  it('opens the delete confirmation modal when a delete button is pressed', async () => {
    hoisted.plugins = [makePlugin()];
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    await chooseRowAction(user, 'plugin-1', 'Remove plugin');

    await waitFor(() =>
      expect(document.querySelector('[data-cy="plugins-list-delete-confirmation-delete-button"]')).toBeInTheDocument(),
    );
  });

  it('calls deletePlugin with the plugin id when deletion is confirmed', async () => {
    hoisted.plugins = [makePlugin()];
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    await chooseRowAction(user, 'plugin-1', 'Remove plugin');
    const confirm = await waitFor(() =>
      document.querySelector('[data-cy="plugins-list-delete-confirmation-delete-button"]'),
    );
    await user.click(confirm as Element);

    expect(hoisted.deleteMutateMock).toHaveBeenCalledWith({ path: { pluginId: 'plugin-1' } });
  });

  it('shows a success toast after a successful delete', () => {
    // The success handler also schedules a full page reload; fake timers keep that out of the test.
    vi.useFakeTimers();
    hoisted.plugins = [makePlugin()];
    renderWithQuery(<PluginsSection />);

    hoisted.deleteOptions?.onSuccess?.();

    expect(hoisted.successToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Plugin removed' }));
    vi.useRealTimers();
  });

  it('shows an error toast when the delete fails', () => {
    hoisted.plugins = [makePlugin()];
    renderWithQuery(<PluginsSection />);

    hoisted.deleteOptions?.onError?.(new Error('boom'));

    expect(hoisted.errorToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not remove the plugin' }));
  });

  it('cancels the delete without calling the mutation', async () => {
    hoisted.plugins = [makePlugin()];
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    await chooseRowAction(user, 'plugin-1', 'Remove plugin');
    const cancel = await waitFor(() =>
      document.querySelector('[data-cy="plugins-list-delete-confirmation-cancel-button"]'),
    );
    await user.click(cancel as Element);

    expect(hoisted.deleteMutateMock).not.toHaveBeenCalled();
  });

  it('renders permission chips scoped to the plugin row', () => {
    hoisted.plugins = [makePlugin({ id: 'p-perms', permissions: ['admin'] })];
    renderWithQuery(<PluginsSection />);

    const container = document.querySelector('[data-cy="plugins-list-permissions-p-perms"]') as HTMLElement;
    expect(container).toBeInTheDocument();
    expect(within(container).getByText('admin')).toBeInTheDocument();
  });
});
