import { render } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import { it } from 'vitest';
import { PluginsSection } from './index';
import type { PluginsSectionTestScope } from './index.test';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';

export function registerCallsDeletePluginWithThePluginIdWhenDeletionIsConfirmed(scope: PluginsSectionTestScope): void {
  it('calls deletePlugin with the plugin id when deletion is confirmed', async () => {
    scope.hoisted.plugins = [scope.makePlugin()];
    const user = userEvent.setup();
    render(<PluginsSection />);

    await user.click(document.querySelector('[data-cy="plugins-list-delete-plugin-button-plugin-1"]') as Element);
    const confirm = await waitFor(() =>
      document.querySelector('[data-cy="plugins-list-delete-confirmation-delete-button"]'),
    );
    await user.click(confirm as Element);

    expect(scope.hoisted.deleteMutateMock).toHaveBeenCalledWith({ pluginId: 'plugin-1' });
  });
}

export function registerCancelsTheDeleteWithoutCallingTheMutation(scope: PluginsSectionTestScope): void {
  it('cancels the delete without calling the mutation', async () => {
    scope.hoisted.plugins = [scope.makePlugin()];
    const user = userEvent.setup();
    render(<PluginsSection />);

    await user.click(document.querySelector('[data-cy="plugins-list-delete-plugin-button-plugin-1"]') as Element);
    const cancel = await waitFor(() =>
      document.querySelector('[data-cy="plugins-list-delete-confirmation-cancel-button"]'),
    );
    await user.click(cancel as Element);

    expect(scope.hoisted.deleteMutateMock).not.toHaveBeenCalled();
  });
}

export function registerChecksMarketplacePluginsForUpdatesAndTakesTheAdminToTheInPlaceUpdateFlow(
  scope: PluginsSectionTestScope,
): void {
  it('checks marketplace plugins for updates and takes the admin to the in-place update flow', async () => {
    scope.hoisted.plugins = [scope.makePlugin()];
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
    const fetchMock = vi.fn((input: { url?: string } | string, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input.url ?? '');
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
    vi.stubGlobal('fetch', fetchMock);
    scope.hoisted.checkAllInstalledPackagesMock.mockResolvedValue([checked]);
    const user = userEvent.setup();
    render(<PluginsSection />);

    await user.click(await screen.findByRole('button', { name: 'Check all now' }));
    expect(await screen.findByText('Plugin updates are available')).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 installed marketplace plugin can be updated. Review the available version before applying it.',
      ),
    ).toBeInTheDocument();
    expect(scope.hoisted.checkAllInstalledPackagesMock).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Review updates' }));
    expect(await screen.findByRole('heading', { name: 'Manage Cool Plugin version' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '1.2.4 Newer' })).toBeInTheDocument();
  });
}

export function registerClosesTheMarketplaceWithItsCancelButton(scope: PluginsSectionTestScope): void {
  it('closes the marketplace with its Cancel button', async () => {
    const user = userEvent.setup();
    render(<PluginsSection />);
    await scope.openMarketplace(user);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('heading', { name: 'Plugin marketplace' })).not.toBeInTheDocument();
  });
}

export function registerDiscardsDetailResponsesThatArriveAfterClosingTheMarketplace(
  scope: PluginsSectionTestScope,
): void {
  it('discards detail responses that arrive after closing the marketplace', async () => {
    const detail = scope.deferred<{ ok: boolean; json: () => Promise<unknown> }>();
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
      }),
    );
    const user = userEvent.setup();
    render(<PluginsSection />);
    await scope.openMarketplace(user);

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
    await scope.openMarketplace(user);

    expect(await screen.findByRole('heading', { name: 'Plugin marketplace' })).toBeInTheDocument();
    expect(screen.queryByText('About this plugin')).not.toBeInTheDocument();
  });
}

export function registerDoesNotReportARegistryAddAsSuccessfulWhenItsRefreshFails(scope: PluginsSectionTestScope): void {
  it('does not report a registry add as successful when its refresh fails', async () => {
    let registryLoads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string } | string, init?: { method?: string }) => {
        const request: { url?: string; method?: string } =
          typeof input === 'string' ? { url: input, method: init?.method } : input;
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
    await scope.openMarketplace(user);

    await user.click(screen.getByText('Manage registries'));
    await user.type(screen.getByLabelText('Registry name'), 'Private');
    await user.type(screen.getByLabelText('Registry URL'), 'https://packages.example.test/npm');
    await user.click(screen.getByRole('button', { name: 'Add registry' }));

    await waitFor(() => expect(scope.hoisted.errorToast).toHaveBeenCalled());
    expect(scope.hoisted.successToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Registry added.' }));
  });
}

export function registerFallsBackToADashForAMissingDirectoryAndNoneRequestedForNoPermissions(
  scope: PluginsSectionTestScope,
): void {
  it('falls back to a dash for a missing directory and "None requested" for no permissions', () => {
    scope.hoisted.plugins = [scope.makePlugin({ pluginDirectory: '', permissions: [] })];
    render(<PluginsSection />);

    expect(screen.getAllByText('-')).toHaveLength(2);
    expect(screen.getByText('None requested')).toBeInTheDocument();
  });
}
