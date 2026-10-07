import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import { it } from 'vitest';
import { PluginsSection } from './index';
import type { PluginsSectionTestScope } from './index.test';
import { vi } from 'vitest';
import { within } from '@testing-library/react';
import type { PluginDependencyConfirmationsTestScope } from './index.test';

export function registerRetriesAFailedPluginWhenTheRestartedServerBecomesAvailableWithoutObservingDowntime(
  scope: PluginsSectionTestScope,
): void {
  it('retries a failed plugin when the restarted server becomes available without observing downtime', async () => {
    scope.hoisted.statusRefetchMock
      .mockResolvedValueOnce({ data: { disabled: false, instanceId: 'original-instance' } })
      .mockResolvedValueOnce({ data: { disabled: false, instanceId: 'restarted-instance' } });
    scope.hoisted.plugins = [scope.makePlugin({ status: 'error', error: 'Plugin startup failed' })];
    const user = userEvent.setup();
    render(<PluginsSection />);

    await user.click(screen.getByRole('button', { name: 'View load error for Cool Plugin' }));
    await user.click(screen.getByRole('button', { name: 'Retry and restart' }));

    await waitFor(() => expect(scope.hoisted.retryMutateAsyncMock).toHaveBeenCalledWith({ pluginId: 'plugin-1' }));
    expect(scope.hoisted.successToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'The plugin will be retried when the app restarts.' }),
    );
    await waitFor(() => expect(scope.hoisted.statusRefetchMock).toHaveBeenCalledTimes(2));
    expect(scope.hoisted.statusRefetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      scope.hoisted.retryMutateAsyncMock.mock.invocationCallOrder[0],
    );
  });
}

export function registerShowsAPluginLoadErrorInAModal(scope: PluginsSectionTestScope): void {
  it('shows a plugin load error in a modal', async () => {
    scope.hoisted.plugins = [scope.makePlugin({ status: 'error', error: "Cannot find module '@nestjs/common'" })];
    const user = userEvent.setup();
    render(<PluginsSection />);

    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    expect(screen.queryByText("Cannot find module '@nestjs/common'")).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View load error for Cool Plugin' }));

    expect(await screen.findByRole('heading', { name: 'Cool Plugin failed to load' })).toBeInTheDocument();
    expect(screen.getByText("Cannot find module '@nestjs/common'")).toBeInTheDocument();
  });
}

export function registerShowsASuccessToastAfterASuccessfulDelete(scope: PluginsSectionTestScope): void {
  it('shows a success toast after a successful delete', () => {
    // The success handler also schedules a full page reload; fake timers keep that out of the test.
    vi.useFakeTimers();
    scope.hoisted.plugins = [scope.makePlugin()];
    render(<PluginsSection />);

    scope.hoisted.deleteOptions?.onSuccess?.();

    expect(scope.hoisted.successToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Plugin removed' }));
    vi.useRealTimers();
  });
}

export function registerShowsAnErrorToastWhenTheDeleteFails(scope: PluginsSectionTestScope): void {
  it('shows an error toast when the delete fails', () => {
    scope.hoisted.plugins = [scope.makePlugin()];
    render(<PluginsSection />);

    scope.hoisted.deleteOptions?.onError?.(new Error('boom'));

    expect(scope.hoisted.errorToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not remove the plugin' }),
    );
  });
}

export function registerShowsDirectAndTransitivePluginsReuseStatusAndPermissionsBeforeOneConfirmation(
  scope: PluginDependencyConfirmationsTestScope,
): void {
  it('shows direct and transitive plugins, reuse status and permissions before one confirmation', async () => {
    scope.hoisted.dependencyPlan = {
      root: scope.provider.name,
      token: 'reviewed-plan',
      plugins: [{ ...scope.core, action: 'reuse' }, scope.adapter, scope.provider],
    };
    const { user } = await scope.openProvider();
    expect(await screen.findByText('3D Printer Core · 1.0.0')).toBeInTheDocument();
    expect(screen.getByText('Already installed · will be reused')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Install' }));
    const dialog = (await screen.findByRole('heading', { name: `Install ${scope.provider.displayName}?` })).closest(
      '[role="dialog"]',
    ) as HTMLElement;
    expect(within(dialog).getByText('Printer Adapter · 1.0.0')).toBeInTheDocument();
    expect(within(dialog).getByText('3D Printer Core · 1.0.0')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox'));
    scope.hoisted.installPackageMock.mockRejectedValue({ body: { message: 'test complete' } });
    await user.click(within(dialog).getByRole('button', { name: 'Install plugin' }));
    expect(scope.hoisted.installPackageMock).toHaveBeenCalledWith({
      packageName: scope.provider.name,
      version: '1.0.0',
      requestBody: { registryId: 'npm', planToken: 'reviewed-plan' },
    });
  });
}

export function registerShowsOnlyTheConfiguredStateForRegistryTokens(scope: PluginsSectionTestScope): void {
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
    await scope.openMarketplace(user);

    await user.click(screen.getByText('Manage registries'));
    expect(await screen.findByText(/Private.*Token configured/)).toBeInTheDocument();
    expect(screen.getByLabelText('Access token (write-only)')).toHaveAttribute('type', 'password');
  });
}

export function registerShowsRefreshedRootPermissionsAndClassificationBeforeRenewedApproval(
  scope: PluginDependencyConfirmationsTestScope,
): void {
  it('shows refreshed root permissions and classification before renewed approval', async () => {
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

    scope.hoisted.dependencyPlan = {
      root: scope.provider.name,
      token: 'changed-root-plan',
      plugins: [
        scope.core,
        scope.adapter,
        { ...scope.provider, permissions: ['MANAGE_USERS'], classification: 'official' },
      ],
    };
    rerender(<PluginsSection />);
    expect(within(dialog).getByRole('checkbox')).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeDisabled();
    expect(within(dialog).getByText('Requested permissions: MANAGE_USERS')).toBeInTheDocument();
    expect(within(dialog).getByText('Official')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeEnabled();
  });
}

export function registerSurfacesDependencyConflictsAndKeepsInstallationDisabled(
  scope: PluginDependencyConfirmationsTestScope,
): void {
  it('surfaces dependency conflicts and keeps installation disabled', async () => {
    scope.hoisted.dependencyPlanError = { body: { message: 'Provider requires core@^2; installed version is 1.0.0' } };
    const { user } = await scope.openProvider();
    expect(await screen.findByText('Provider requires core@^2; installed version is 1.0.0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Install' }));
    const dialog = (await screen.findByRole('heading', { name: `Install ${scope.provider.displayName}?` })).closest(
      '[role="dialog"]',
    ) as HTMLElement;
    await user.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeDisabled();
    expect(scope.hoisted.installPackageMock).not.toHaveBeenCalled();
  });
}

export function registerUsesExactPackageLookupWhenASelectedRegistryCannotBeSearched(
  scope: PluginsSectionTestScope,
): void {
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
    await scope.openMarketplace(user);

    await user.selectOptions(screen.getByLabelText('Registry'), 'private');
    await user.type(screen.getByLabelText('Search plugins'), '@private/plugin');

    expect(await screen.findByText('Private plugin')).toBeInTheDocument();
  });
}
