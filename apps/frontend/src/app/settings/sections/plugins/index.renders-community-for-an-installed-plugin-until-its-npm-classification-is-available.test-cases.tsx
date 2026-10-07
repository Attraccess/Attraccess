import { render } from '@testing-library/react';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { PluginsSection } from './index';
import type { PluginsSectionTestScope } from './index.test';
import { within } from '@testing-library/react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { waitFor } from '@testing-library/react';
import type { PluginDependencyConfirmationsTestScope } from './index.test';

export function registerRendersCommunityForAnInstalledPluginUntilItsNpmClassificationIsAvailable(
  scope: PluginsSectionTestScope,
): void {
  it('renders community for an installed plugin until its npm classification is available', () => {
    scope.hoisted.plugins = [scope.makePlugin({ name: '@attraccess/plugin-example' })];
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
}

export function registerRendersPermissionChipsScopedToThePluginRow(scope: PluginsSectionTestScope): void {
  it('renders permission chips scoped to the plugin row', () => {
    scope.hoisted.plugins = [scope.makePlugin({ id: 'p-perms', permissions: ['admin'] })];
    render(<PluginsSection />);

    const container = document.querySelector('[data-cy="plugins-list-permissions-p-perms"]') as HTMLElement;
    expect(container).toBeInTheDocument();
    expect(within(container).getByText('admin')).toBeInTheDocument();
  });
}

export function registerRendersTheOfficialMarketplaceClassification(scope: PluginsSectionTestScope): void {
  it('renders the official marketplace classification', async () => {
    const user = userEvent.setup();
    render(<PluginsSection />);
    await scope.openMarketplace(user);

    expect(await screen.findByText('Example')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Official plugins' })).toBeInTheDocument();
    expect(screen.getByText('Official')).toBeInTheDocument();
    expect(screen.getByText('Version: 1.0.0')).toBeInTheDocument();
  });
}

export function registerRendersTheSectionHeadingInstallMenuAndTableHeaders(scope: PluginsSectionTestScope): void {
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
}

export function registerReportsFailedPackageUpdateChecks(scope: PluginsSectionTestScope): void {
  it('reports failed package update checks', async () => {
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
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string } | string) => {
        const url = typeof input === 'string' ? input : (input.url ?? '');
        if (url.endsWith('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [installed] });
        if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
        return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
      }),
    );
    scope.hoisted.checkAllInstalledPackagesMock.mockResolvedValue([
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
    render(<PluginsSection />);

    await user.click(await screen.findByRole('button', { name: 'Check all now' }));

    await waitFor(() =>
      expect(scope.hoisted.errorToast).toHaveBeenCalledWith({ title: 'Could not check plugin updates' }),
    );
    expect(scope.hoisted.successToast).not.toHaveBeenCalled();
  });
}

export function registerReportsRegistrySearchFailuresAlongsidePartialMarketplaceResults(
  scope: PluginsSectionTestScope,
): void {
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
    await scope.openMarketplace(user);

    await waitFor(() =>
      expect(scope.hoisted.errorToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Could not search Private' }),
      ),
    );
  });
}

export function registerRequiresExplicitApprovalOfAllDependantsBeforeRemovingADependency(
  scope: PluginDependencyConfirmationsTestScope,
): void {
  it('requires explicit approval of all dependants before removing a dependency', async () => {
    scope.hoisted.plugins = [scope.makePlugin({ name: scope.core.name, id: 'core-id' })];
    scope.hoisted.removalPlan = [scope.core, scope.provider];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({ ok: true, json: async () => (url.endsWith('/installed') ? [scope.core] : []) }),
      ),
    );
    const user = userEvent.setup();
    const view = render(<PluginsSection />);
    await waitFor(() => expect(screen.getByText(scope.core.name)).toBeInTheDocument());
    await user.click(document.querySelector('[data-cy="plugins-list-delete-plugin-button-core-id"]') as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(`${scope.provider.name} · ${scope.provider.version}`)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeDisabled();
    await user.click(within(dialog).getByRole('switch'));
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeEnabled();
    scope.hoisted.removalPlan = [scope.core, scope.adapter, scope.provider];
    view.rerender(<PluginsSection />);
    expect(within(dialog).getByRole('switch')).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeDisabled();
    await user.click(within(dialog).getByRole('switch'));
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(scope.hoisted.removeGraphMock).toHaveBeenCalledWith({
      packageName: scope.core.name,
      requestBody: { approvedDependants: [scope.adapter.name, scope.provider.name] },
    });
  });
}

export function registerRequiresRenewedApprovalWhenARefreshedInstallPlanChangesDependencyPermissions(
  scope: PluginDependencyConfirmationsTestScope,
): void {
  it('requires renewed approval when a refreshed install plan changes dependency permissions', async () => {
    scope.hoisted.dependencyPlan = {
      root: scope.provider.name,
      token: 'original-plan',
      plugins: [scope.core, scope.adapter, scope.provider],
    };
    const { user, rerender } = await scope.openProvider();
    await user.click(screen.getByRole('button', { name: 'Install' }));
    const dialog = (await screen.findByRole('heading', { name: `Install ${scope.provider.displayName}?` })).closest(
      '[role="dialog"]',
    ) as HTMLElement;
    await user.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeEnabled();

    scope.hoisted.dependencyPlan = {
      root: scope.provider.name,
      token: 'changed-plan',
      plugins: [{ ...scope.core, permissions: ['READ_USERS', 'MANAGE_USERS'] }, scope.adapter, scope.provider],
    };
    rerender(<PluginsSection />);
    expect(within(dialog).getByRole('checkbox')).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeDisabled();
    expect(within(dialog).getByText('Requested permissions: READ_USERS, MANAGE_USERS')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeEnabled();
  });
}

export function registerRequiresSourceAndPermissionAcknowledgementBeforeInstalling(
  scope: PluginsSectionTestScope,
): void {
  it('requires source and permission acknowledgement before installing', async () => {
    const user = userEvent.setup();
    render(<PluginsSection />);
    await scope.openMarketplace(user);

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
}
