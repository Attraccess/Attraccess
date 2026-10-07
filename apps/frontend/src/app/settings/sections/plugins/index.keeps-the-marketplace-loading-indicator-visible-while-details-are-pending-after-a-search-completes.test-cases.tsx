import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { PluginsSection } from './index';
import type { PluginsSectionTestScope } from './index.test';
import { waitFor } from '@testing-library/react';
import type { RootTestRegistrationsTestScope } from './index.test';

export function registerKeepsTheMarketplaceLoadingIndicatorVisibleWhileDetailsArePendingAfterASearchCompletes(
  scope: PluginsSectionTestScope,
): void {
  it('keeps the marketplace loading indicator visible while details are pending after a search completes', async () => {
    const detail = scope.deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const refreshedSearch = scope.deferred<{ ok: boolean; json: () => Promise<unknown> }>();
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
    await scope.openMarketplace(user);

    await user.click(await screen.findByText('Example'));
    await user.type(screen.getByLabelText('Search plugins'), 's');
    await new Promise((resolve) => setTimeout(resolve, 350));
    refreshedSearch.resolve({ ok: true, json: async () => ({ results: [plugin], errors: [] }) });

    expect(await screen.findByText('Searching plugins...')).toBeInTheDocument();
    detail.resolve({ ok: true, json: async () => plugin });
  });
}

export function registerKeepsTheRetryActionPendingWhileItWaitsForTheRestartedServer(
  scope: PluginsSectionTestScope,
): void {
  it('keeps the retry action pending while it waits for the restarted server', async () => {
    const restartStatus = scope.deferred<{ data: { disabled: boolean; instanceId: string } }>();
    scope.hoisted.statusRefetchMock
      .mockResolvedValueOnce({ data: { disabled: false, instanceId: 'original-instance' } })
      .mockReturnValueOnce(restartStatus.promise);
    scope.hoisted.plugins = [scope.makePlugin({ status: 'error', error: 'Plugin startup failed' })];
    const user = userEvent.setup();
    render(<PluginsSection />);

    await user.click(screen.getByRole('button', { name: 'View load error for Cool Plugin' }));
    await user.click(screen.getByRole('button', { name: 'Retry and restart' }));

    await waitFor(() => expect(scope.hoisted.statusRefetchMock).toHaveBeenCalledTimes(2));
    expect(document.querySelector('[data-cy="plugins-list-retry-load-button"]')).toHaveAttribute(
      'data-pending',
      'true',
    );

    restartStatus.resolve({ data: { disabled: false, instanceId: 'restarted-instance' } });
    await waitFor(() => expect(scope.hoisted.successToast).toHaveBeenCalled());
  });
}

export function registerOpensDetailsWhenADebouncedSearchStartsAfterTheDetailsClick(
  scope: PluginsSectionTestScope,
): void {
  it('opens details when a debounced search starts after the details click', async () => {
    const detail = scope.deferred<{ ok: boolean; json: () => Promise<unknown> }>();
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
    await scope.openMarketplace(user);

    await user.type(screen.getByLabelText('Search plugins'), 's');
    await user.click(await screen.findByText('Example'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    detail.resolve({ ok: true, json: async () => plugin });

    expect(await screen.findByText('About this plugin')).toBeInTheDocument();
  });
}

export function registerOpensInstalledPackageDetailsFromTheOriginalRegistry(
  scope: RootTestRegistrationsTestScope,
): void {
  it('opens installed package details from the original registry', async () => {
    scope.hoisted.plugins = [scope.makePlugin()];
    const fetchMock = vi.fn((input: { url?: string } | string) => {
      const url = typeof input === 'string' ? input : (input.url ?? '');
      const details = {
        name: 'Cool Plugin',
        version: '1.2.3',
        displayName: 'Installed package details',
        permissions: [],
        registry: { id: 'private', name: 'Private', url: 'https://packages.example.test' },
        classification: 'community',
        installable: true,
      };
      return Promise.resolve({
        ok: true,
        json: async () =>
          url.endsWith('/installed')
            ? [{ ...details, registryId: 'private' }]
            : url.includes('/marketplace/Cool%20Plugin')
              ? details
              : url.includes('/marketplace/search')
                ? { results: [], errors: [] }
                : [],
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PluginsSection />);
    await user.click(await screen.findByRole('button', { name: 'Details' }));
    expect(await screen.findByText('Installed package details')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/marketplace/Cool%20Plugin?registryId=private'), {
      credentials: 'include',
    });
  });
}

export function registerOpensPackageDetailsInTheMarketplaceAndReturnsToTheCatalog(
  scope: PluginsSectionTestScope,
): void {
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
    await scope.openMarketplace(user);

    await user.click((await screen.findAllByText('Second'))[1]);
    expect(await screen.findByRole('heading', { name: 'Second' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Plugin marketplace' })).toBeInTheDocument();
  });
}

export function registerOpensTheDeleteConfirmationModalWhenADeleteButtonIsPressed(
  scope: PluginsSectionTestScope,
): void {
  it('opens the delete confirmation modal when a delete button is pressed', async () => {
    scope.hoisted.plugins = [scope.makePlugin()];
    const user = userEvent.setup();
    render(<PluginsSection />);

    await user.click(document.querySelector('[data-cy="plugins-list-delete-plugin-button-plugin-1"]') as Element);

    await waitFor(() =>
      expect(document.querySelector('[data-cy="plugins-list-delete-confirmation-delete-button"]')).toBeInTheDocument(),
    );
  });
}

export function registerOpensTheUploadDrawerWhenTheUploadButtonIsPressed(scope: PluginsSectionTestScope): void {
  it('opens the upload drawer when the upload button is pressed', async () => {
    const user = userEvent.setup();
    render(<PluginsSection />);

    expect(document.querySelector('[data-cy="upload-plugin-modal"]')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Install plugin' }));
    await user.click(screen.getByText('Upload ZIP file'));

    await waitFor(() => expect(document.querySelector('[data-cy="upload-plugin-modal"]')).toBeInTheDocument());
  });
}

export function registerRendersARowPerPluginWithNameVersionDirectoryAndPermissionChips(
  scope: PluginsSectionTestScope,
): void {
  it('renders a row per plugin with name, version, directory and permission chips', () => {
    scope.hoisted.plugins = [scope.makePlugin()];
    render(<PluginsSection />);

    expect(screen.getByText('Cool Plugin')).toBeInTheDocument();
    expect(screen.getByText('1.2.3')).toBeInTheDocument();
    expect(screen.getByText('/plugins/cool')).toBeInTheDocument();
    expect(screen.getByText('read:resources')).toBeInTheDocument();
    expect(screen.getByText('write:resources')).toBeInTheDocument();
  });
}
