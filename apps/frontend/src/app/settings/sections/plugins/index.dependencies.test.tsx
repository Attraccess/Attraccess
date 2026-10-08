import { hoisted, makePlugin } from './index.test.hoisted';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, expect, it } from 'vitest';
import { PluginsSection } from './index';

import { describe } from 'vitest';
describe('plugin dependency confirmations', () => {
  const core = {
    name: '@vendor/core',
    displayName: '3D Printer Core',
    version: '1.0.0',
    action: 'install',
    permissions: ['READ_USERS'],
    dependencies: [],
    classification: 'community',
  };
  const adapter = {
    ...core,
    name: '@vendor/adapter',
    displayName: 'Printer Adapter',
    dependencies: [{ name: core.name, version: '^1', required: true }],
  };
  const provider = {
    ...core,
    name: '@vendor/bambu',
    displayName: '3D Printer - Bambu Lab',
    dependencies: [{ name: adapter.name, version: '^1', required: true }],
    registry: { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org' },
    installable: true,
    description: 'Printer provider',
  };
  const openProvider = async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: async () =>
            url.endsWith('/installed') || url.endsWith('/registries')
              ? []
              : url.includes('/marketplace/search')
                ? { results: [provider], errors: [] }
                : provider,
        }),
      ),
    );
    const user = userEvent.setup();
    const view = render(<PluginsSection />);
    await user.click(screen.getByText('Install plugin'));
    await user.click(screen.getByText('Browse marketplace'));
    await user.click(await screen.findByText(provider.displayName));
    return { user, rerender: view.rerender };
  };
  it('shows direct and transitive plugins, reuse status and permissions before one confirmation', async () => {
    hoisted.dependencyPlan = {
      root: provider.name,
      token: 'reviewed-plan',
      plugins: [{ ...core, action: 'reuse' }, adapter, provider],
    };
    const { user } = await openProvider();
    expect(await screen.findByText('3D Printer Core · 1.0.0')).toBeInTheDocument();
    expect(screen.getByText('Already installed · will be reused')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Install' }));
    const dialog = (await screen.findByRole('heading', { name: `Install ${provider.displayName}?` })).closest(
      '[role="dialog"]',
    ) as HTMLElement;
    expect(within(dialog).getByText('Printer Adapter · 1.0.0')).toBeInTheDocument();
    expect(within(dialog).getByText('3D Printer Core · 1.0.0')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox'));
    hoisted.installPackageMock.mockRejectedValue({ body: { message: 'test complete' } });
    await user.click(within(dialog).getByRole('button', { name: 'Install plugin' }));
    expect(hoisted.installPackageMock).toHaveBeenCalledWith({
      packageName: provider.name,
      version: '1.0.0',
      requestBody: { registryId: 'npm', planToken: 'reviewed-plan' },
    });
  });

  it('surfaces dependency conflicts and keeps installation disabled', async () => {
    hoisted.dependencyPlanError = { body: { message: 'Provider requires core@^2; installed version is 1.0.0' } };
    const { user } = await openProvider();
    expect(await screen.findByText('Provider requires core@^2; installed version is 1.0.0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Install' }));
    const dialog = (await screen.findByRole('heading', { name: `Install ${provider.displayName}?` })).closest(
      '[role="dialog"]',
    ) as HTMLElement;
    await user.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeDisabled();
    expect(hoisted.installPackageMock).not.toHaveBeenCalled();
  });

  it('requires renewed approval when a refreshed install plan changes dependency permissions', async () => {
    hoisted.dependencyPlan = {
      root: provider.name,
      token: 'original-plan',
      plugins: [core, adapter, provider],
    };
    const { user, rerender } = await openProvider();
    await user.click(screen.getByRole('button', { name: 'Install' }));
    const dialog = (await screen.findByRole('heading', { name: `Install ${provider.displayName}?` })).closest(
      '[role="dialog"]',
    ) as HTMLElement;
    await user.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeEnabled();

    hoisted.dependencyPlan = {
      root: provider.name,
      token: 'changed-plan',
      plugins: [{ ...core, permissions: ['READ_USERS', 'MANAGE_USERS'] }, adapter, provider],
    };
    rerender(<PluginsSection />);
    expect(within(dialog).getByRole('checkbox')).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeDisabled();
    expect(within(dialog).getByText('Requested permissions: READ_USERS, MANAGE_USERS')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeEnabled();
  });

  it('shows refreshed root permissions and classification before renewed approval', async () => {
    hoisted.dependencyPlan = {
      root: provider.name,
      token: 'original-plan',
      plugins: [core, adapter, provider],
    };
    const { user, rerender } = await openProvider();
    await user.click(screen.getByRole('button', { name: 'Install' }));
    const dialog = (await screen.findByRole('heading', { name: `Install ${provider.displayName}?` })).closest(
      '[role="dialog"]',
    ) as HTMLElement;
    await user.click(within(dialog).getByRole('checkbox'));

    hoisted.dependencyPlan = {
      root: provider.name,
      token: 'changed-root-plan',
      plugins: [core, adapter, { ...provider, permissions: ['MANAGE_USERS'], classification: 'official' }],
    };
    rerender(<PluginsSection />);
    expect(within(dialog).getByRole('checkbox')).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeDisabled();
    expect(within(dialog).getByText('Requested permissions: MANAGE_USERS')).toBeInTheDocument();
    expect(within(dialog).getByText('Official')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: 'Install plugin' })).toBeEnabled();
  });

  it('requires explicit approval of all dependants before removing a dependency', async () => {
    hoisted.plugins = [makePlugin({ name: core.name, id: 'core-id' })];
    hoisted.removalPlan = [core, provider];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({ ok: true, json: async () => (url.endsWith('/installed') ? [core] : []) }),
      ),
    );
    const user = userEvent.setup();
    const view = render(<PluginsSection />);
    await waitFor(() => expect(screen.getByText(core.name)).toBeInTheDocument());
    await user.click(document.querySelector('[data-cy="plugins-list-delete-plugin-button-core-id"]') as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(`${provider.name} · ${provider.version}`)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeDisabled();
    await user.click(within(dialog).getByRole('switch'));
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeEnabled();
    hoisted.removalPlan = [core, adapter, provider];
    view.rerender(<PluginsSection />);
    expect(within(dialog).getByRole('switch')).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeDisabled();
    await user.click(within(dialog).getByRole('switch'));
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(hoisted.removeGraphMock).toHaveBeenCalledWith({
      packageName: core.name,
      requestBody: { approvedDependants: [adapter.name, provider.name] },
    });
  });
});
describe('plugin version management', () => {
  it('saves a version policy and requires fresh approvals when switching release candidates', async () => {
    hoisted.plugins = [makePlugin()];
    const installed = {
      name: 'Cool Plugin',
      version: '1.2.3',
      registryId: 'npm',
      requestedSpec: 'latest',
      updateOverride: 'inherit',
    };
    const candidate = {
      version: '2.0.0',
      direction: 'newer',
      compatible: true,
      permissionAdditions: ['write:users'],
      permissionRemovals: ['read:old'],
      semverImpact: 'major',
      publishedAt: '2026-09-01T10:00:00Z',
      deprecated: 'Use the next release',
      integrity: 'sha512-release',
      repository: 'https://example.test/releases',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: { url?: string } | string) => {
        const url = typeof input === 'string' ? input : (input.url ?? '');
        const data = url.endsWith('/installed')
          ? [installed]
          : url.endsWith('/versions')
            ? [
                candidate,
                { ...candidate, version: '1.0.0', direction: 'older', semverImpact: 'minor', permissionAdditions: [] },
                { ...candidate, version: '3.0.0', compatible: false, reason: 'Requires a newer host' },
              ]
            : [];
        return Promise.resolve({ ok: true, json: async () => data });
      }),
    );
    hoisted.updateInstalledPackagePolicyMock.mockResolvedValue({
      ...installed,
      requestedSpec: '^2.0.0',
      updateOverride: 'patch',
    });
    const user = userEvent.setup();
    render(<PluginsSection />);
    await user.click(await screen.findByRole('button', { name: 'Manage version' }));
    const spec = screen.getByRole('textbox', { name: 'Requested version or channel' });
    await user.clear(spec);
    await user.type(spec, '^2.0.0');
    await user.click(screen.getByRole('button', { name: /Plugin automatic update policy/ }));
    await user.click(screen.getByRole('option', { name: 'Patch only' }));
    await user.click(screen.getByRole('button', { name: 'Save version policy' }));
    await waitFor(() =>
      expect(hoisted.updateInstalledPackagePolicyMock).toHaveBeenCalledWith({
        packageName: 'Cool Plugin',
        requestBody: { requestedSpec: '^2.0.0', updateOverride: 'patch' },
      }),
    );
    expect(screen.getByText('3.0.0: Requires a newer host')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3.0.0 Newer' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '2.0.0 Newer' }));
    expect(screen.getByRole('link', { name: 'Release repository' })).toHaveAttribute('href', candidate.repository);
    expect(screen.getByText('Removed permissions: read:old')).toBeInTheDocument();
    const update = screen.getByRole('button', { name: 'Update' });
    expect(update).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'I approve these new permissions: write:users' }));
    expect(update).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: /I approve this major version/ }));
    expect(update).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '1.0.0 Older' }));
    expect(
      screen.getByText('Downgrading can affect plugin data and requires an application restart.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '2.0.0 Newer' }));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('switch')).not.toBeChecked();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() =>
      expect(hoisted.replaceInstalledPackageMock).toHaveBeenCalledWith({
        packageName: 'Cool Plugin',
        version: '2.0.0',
        requestBody: { approvedPermissionAdditions: ['write:users'], approvedMajorVersion: true },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Manage Cool Plugin version' })).not.toBeInTheDocument(),
    );
  });

  it('opens installed package details from the original registry', async () => {
    hoisted.plugins = [makePlugin()];
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
});
