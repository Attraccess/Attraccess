import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { PluginsSection } from './index';
import type { PluginsSectionTestScope } from './index.test';
import { fireEvent } from '@testing-library/react';

export function registerInstallsAnExactPrivatePackageVersionFromItsSelectedRegistry(
  scope: PluginsSectionTestScope,
): void {
  it('installs an exact private package version from its selected registry', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: { url?: string } | string) => {
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
    await scope.openMarketplace(user);

    await user.selectOptions(screen.getByLabelText('Registry'), 'private');
    await user.type(screen.getByLabelText('Search plugins'), '@private/plugin');
    await user.click(await screen.findByText('Private plugin'));
    await user.click(await screen.findByRole('button', { name: 'Install' }));
    await user.click(screen.getByRole('checkbox'));
    const installDialog = screen.getByRole('heading', { name: 'Install Private plugin?' }).closest('[role="dialog"]');
    expect(installDialog).not.toBeNull();
    await user.click(within(installDialog as HTMLElement).getByRole('button', { name: 'Install plugin' }));

    await waitFor(() =>
      expect(scope.hoisted.installPackageMock).toHaveBeenCalledWith({
        packageName: '@private/plugin',
        version: '2.3.4',
        requestBody: { registryId: 'private' },
      }),
    );
  });
}

export function registerKeepsANewerTestForTheSameRegistryPendingWhenAnEarlierTestCompletes(
  scope: PluginsSectionTestScope,
): void {
  it('keeps a newer test for the same registry pending when an earlier test completes', async () => {
    const firstTest = scope.deferred<{ ok: boolean }>();
    const secondTest = scope.deferred<{ ok: boolean }>();
    const latestFirstTest = scope.deferred<{ ok: boolean }>();
    let firstTestRequests = 0;
    scope.hoisted.testRegistryMock.mockImplementation(({ registryId }: { registryId: string }) => {
      if (registryId === 'first') {
        firstTestRequests += 1;
        return firstTestRequests === 1 ? firstTest.promise : latestFirstTest.promise;
      }
      return secondTest.promise;
    });
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
        if (request.url?.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
        return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
      }),
    );
    const user = userEvent.setup();
    render(<PluginsSection />);
    await scope.openMarketplace(user);

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
}

export function registerKeepsIncompatibleMarketplacePackagesVisibleWithTheirReason(
  scope: PluginsSectionTestScope,
): void {
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
    await scope.openMarketplace(user);

    expect(await screen.findByText('Plugin is not compatible with Attraccess 1.0.0')).toBeInTheDocument();
  });
}

export function registerKeepsTheInstallFailureAndCompatibilityRemedyVisibleInTheInstallConfirmationModal(
  scope: PluginsSectionTestScope,
): void {
  it('keeps the install failure and compatibility remedy visible in the install confirmation modal', async () => {
    scope.hoisted.installPackageMock.mockRejectedValue({
      status: 400,
      body: { message: 'Plugin is not compatible with Attraccess 1.9.0' },
    });
    const user = userEvent.setup();
    render(<PluginsSection />);
    await scope.openMarketplace(user);
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
}

export function registerKeepsTheLatestRegistryRefreshWhenAnEarlierLoadCompletesLate(
  scope: PluginsSectionTestScope,
): void {
  it('keeps the latest registry refresh when an earlier load completes late', async () => {
    const initial = scope.deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const refreshed = scope.deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    let registryLoads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string } | string, init?: { method?: string }) => {
        const request: { url?: string; method?: string } =
          typeof input === 'string' ? { url: input, method: init?.method } : input;
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
    await scope.openMarketplace(user);

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
}
