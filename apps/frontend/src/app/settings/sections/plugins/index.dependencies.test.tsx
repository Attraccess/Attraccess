import '@testing-library/jest-dom/vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
// Register the shared API mocks before loading the component's feature modules.
import { hoisted, makePlugin, renderWithQuery } from './index.test.hoisted';
import { PluginsSection } from './index';

import { describe } from 'vitest';

/** Opens the first plugin row's actions menu and returns the item named `item`. */
async function openActions(user: ReturnType<typeof userEvent.setup>, item: string) {
  await user.click((await screen.findAllByRole('button', { name: /^Actions for / }))[0]);
  return screen.findByRole('menuitem', { name: item });
}
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
    hoisted.apiMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          url.endsWith('/installed') || url.endsWith('/registries')
            ? []
            : url.includes('/marketplace/search')
              ? { results: [provider], errors: [] }
              : provider,
      }),
    );
    const user = userEvent.setup();
    const view = renderWithQuery(<PluginsSection />);
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
      path: { packageName: provider.name, version: '1.0.0' },
      body: { registryId: 'npm', followHostChannel: true, planToken: 'reviewed-plan' },
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
    hoisted.apiMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () => (url.endsWith('/installed') ? [{ ...core, installPath: '/plugins/cool' }] : []),
      }),
    );
    const user = userEvent.setup();
    const view = renderWithQuery(<PluginsSection />);
    await waitFor(() => expect(screen.getByText(core.name)).toBeInTheDocument());
    await user.click(document.querySelector('[data-cy="plugins-list-actions-button-core-id"]') as HTMLElement);
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
      path: { packageName: core.name },
      body: { approvedDependants: [adapter.name, provider.name] },
    });
    await waitFor(() => expect(hoisted.reloadPage).toHaveBeenCalledOnce());
  });
});
describe('plugin version management', () => {
  it('reports a failed version load once per opening and not again for the cached failure', async () => {
    hoisted.plugins = [makePlugin()];
    hoisted.errorToast.mockClear();
    const installed = {
      name: 'Cool Plugin',
      version: '1.2.3',
      installPath: '/plugins/cool',
      registryId: 'npm',
      requestedSpec: 'latest',
    };
    let versionsResponse: { ok: boolean; data: unknown } = { ok: false, data: null };
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/versions'))
        return Promise.resolve({ ok: versionsResponse.ok, json: async () => versionsResponse.data });
      return Promise.resolve({ ok: true, json: async () => (url.endsWith('/installed') ? [installed] : []) });
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    const open = async () => user.click(await openActions(user, 'Manage version'));
    const close = async () => {
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: 'Manage Cool Plugin version' })).not.toBeInTheDocument(),
      );
    };

    await open();
    await waitFor(() => expect(hoisted.errorToast).toHaveBeenCalledTimes(1));
    await close();
    await open();
    await waitFor(() => expect(hoisted.errorToast).toHaveBeenCalledTimes(2));
    await close();

    versionsResponse = { ok: true, data: [] };
    await open();
    await screen.findByRole('textbox', { name: 'Requested version or channel' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(hoisted.errorToast).toHaveBeenCalledTimes(2);
  });

  it('saves a version policy and requires fresh approvals when switching release candidates', async () => {
    hoisted.plugins = [makePlugin()];
    const installed = {
      name: 'Cool Plugin',
      version: '1.2.3',
      installPath: '/plugins/cool',
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
    hoisted.apiMock.mockImplementation((url: string) => {
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
    });
    hoisted.updateInstalledPackagePolicyMock.mockResolvedValue({
      ...installed,
      requestedSpec: '^2.0.0',
      updateOverride: 'patch',
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await user.click(await openActions(user, 'Manage version'));
    const spec = screen.getByRole('textbox', { name: 'Requested version or channel' });
    await user.clear(spec);
    await user.type(spec, '^2.0.0');
    await user.click(screen.getByRole('button', { name: /Plugin automatic update policy/ }));
    await user.click(screen.getByRole('option', { name: 'Patch only' }));
    await user.click(screen.getByRole('button', { name: 'Save update settings' }));
    await waitFor(() =>
      expect(hoisted.updateInstalledPackagePolicyMock).toHaveBeenCalledWith({
        path: { packageName: 'Cool Plugin' },
        body: { requestedSpec: '^2.0.0', updateOverride: 'patch' },
      }),
    );
    expect(screen.getByText('Not compatible: Requires a newer host')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^3\.0\.0 / })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /^2\.0\.0 / }));
    expect(screen.getByRole('link', { name: 'Release repository' })).toHaveAttribute('href', candidate.repository);
    expect(screen.getByText('Removed permissions: read:old')).toBeInTheDocument();
    const update = screen.getByRole('button', { name: 'Update to 2.0.0' });
    expect(update).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'I approve these new permissions: write:users' }));
    expect(update).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: /I approve this major version/ }));
    expect(update).toBeEnabled();
    await user.click(screen.getByRole('radio', { name: /^1\.0\.0 / }));
    expect(
      screen.getByText('Downgrading can affect plugin data. It takes effect after a restart.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Downgrade to 1.0.0' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /^2\.0\.0 / }));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /I approve/ })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('switch', { name: /I approve/ }));
    await user.click(screen.getByRole('button', { name: 'Update to 2.0.0' }));
    await waitFor(() =>
      expect(hoisted.replaceInstalledPackageMock).toHaveBeenCalledWith({
        path: { packageName: 'Cool Plugin', version: '2.0.0' },
        body: { approvedPermissionAdditions: ['write:users'], approvedMajorVersion: true },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Manage Cool Plugin version' })).not.toBeInTheDocument(),
    );
    // The new version waits for a restart: the dialog closes with a toast, the page stays.
    expect(hoisted.successToast).toHaveBeenCalledWith({
      title: 'Plugin version replaced',
      description: expect.stringContaining('after a restart'),
    });
    expect(hoisted.reloadPage).not.toHaveBeenCalled();
  });

  it('keeps a saved version policy when the dialog opens again', async () => {
    hoisted.plugins = [makePlugin()];
    const installed = {
      name: 'Cool Plugin',
      version: '1.2.3',
      installPath: '/plugins/cool',
      registryId: 'npm',
      requestedSpec: 'latest',
      updateOverride: 'inherit',
    };
    hoisted.apiMock.mockImplementation((url: string) =>
      Promise.resolve({ ok: true, json: async () => (url.endsWith('/installed') ? [installed] : []) }),
    );
    hoisted.updateInstalledPackagePolicyMock.mockResolvedValue({
      ...installed,
      requestedSpec: '^2.0.0',
      updateOverride: 'patch',
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await user.click(await openActions(user, 'Manage version'));
    const spec = screen.getByRole('textbox', { name: 'Requested version or channel' });
    await user.clear(spec);
    await user.type(spec, '^2.0.0');
    await user.click(screen.getByRole('button', { name: /Plugin automatic update policy/ }));
    await user.click(screen.getByRole('option', { name: 'Patch only' }));
    await user.click(screen.getByRole('button', { name: 'Save update settings' }));
    await waitFor(() => expect(hoisted.successToast).toHaveBeenCalledWith({ title: 'Plugin version policy saved' }));

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Manage Cool Plugin version' })).not.toBeInTheDocument(),
    );
    await user.click(await openActions(user, 'Manage version'));

    expect(await screen.findByRole('textbox', { name: 'Requested version or channel' })).toHaveValue('^2.0.0');
    expect(screen.getByRole('button', { name: /Plugin automatic update policy/ })).toHaveTextContent('Patch only');
  });

  it('requires approval of newly installed dependencies before switching versions', async () => {
    hoisted.plugins = [makePlugin()];
    const installed = {
      name: 'Cool Plugin',
      version: '1.2.3',
      installPath: '/plugins/cool',
      registryId: 'npm',
      updateOverride: 'inherit',
    };
    const core = {
      name: '@vendor/core',
      displayName: '3D Printer Core',
      version: '1.0.0',
      action: 'install',
      permissions: [],
      dependencies: [],
      classification: 'community',
    };
    const candidate = {
      version: '1.3.0',
      direction: 'newer',
      compatible: true,
      permissionAdditions: [],
      permissionRemovals: [],
      semverImpact: 'minor',
      dependencies: [{ name: core.name, version: '^1', required: true }],
    };
    hoisted.dependencyPlan = {
      root: 'Cool Plugin',
      token: 'version-plan',
      plugins: [core, { ...core, name: 'Cool Plugin', displayName: 'Cool Plugin', version: '1.3.0' }],
    };
    hoisted.apiMock.mockImplementation((url: string) => {
      const data = url.endsWith('/installed') ? [installed] : url.endsWith('/versions') ? [candidate] : [];
      return Promise.resolve({ ok: true, json: async () => data });
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await user.click(await openActions(user, 'Manage version'));
    await user.click(await screen.findByRole('radio', { name: /^1\.3\.0 / }));

    expect(screen.getByText('3D Printer Core · 1.0.0')).toBeInTheDocument();
    const update = screen.getByRole('button', { name: 'Update to 1.3.0' });
    expect(update).toBeDisabled();
    const approval = screen.getByRole('switch', { name: /I approve installing these dependencies/ });
    await user.click(approval);
    expect(update).toBeEnabled();
    await user.click(approval);
    expect(update).toBeDisabled();
    await user.click(approval);
    await user.click(update);

    await waitFor(() =>
      expect(hoisted.replaceInstalledPackageMock).toHaveBeenCalledWith({
        path: { packageName: 'Cool Plugin', version: '1.3.0' },
        body: { approvedPermissionAdditions: [], approvedMajorVersion: false, planToken: 'version-plan' },
      }),
    );
  });

  it('opens installed package details from the original registry', async () => {
    hoisted.plugins = [makePlugin()];
    hoisted.apiMock.mockImplementation((url: string) => {
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
            ? [{ ...details, installPath: '/plugins/cool', registryId: 'private' }]
            : url.includes('/marketplace/Cool%20Plugin')
              ? details
              : url.includes('/marketplace/search')
                ? { results: [], errors: [] }
                : [],
      });
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await user.click(await openActions(user, 'Details'));
    expect(await screen.findByText('Installed package details')).toBeInTheDocument();
    expect(hoisted.apiMock).toHaveBeenCalledWith(
      expect.stringContaining('/marketplace/Cool%20Plugin?registryId=private'),
    );
  });

  it('reports a failed package load for installed package details without opening the marketplace', async () => {
    hoisted.plugins = [makePlugin()];
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.includes('/marketplace/Cool%20Plugin')) return Promise.resolve({ ok: false });
      const installed = [
        { name: 'Cool Plugin', version: '1.2.3', installPath: '/plugins/cool', registryId: 'private' },
      ];
      return Promise.resolve({ ok: true, json: async () => (url.endsWith('/installed') ? installed : []) });
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);
    await user.click(await openActions(user, 'Details'));

    await waitFor(() => expect(hoisted.errorToast).toHaveBeenCalledWith({ title: 'Could not load the marketplace.' }));
    expect(hoisted.apiMock).toHaveBeenCalledWith('/api/plugins/marketplace/Cool%20Plugin?registryId=private');
    expect(screen.queryByRole('heading', { name: 'Plugin marketplace' })).not.toBeInTheDocument();
    expect(screen.queryByText('About this plugin')).not.toBeInTheDocument();
  });
});
