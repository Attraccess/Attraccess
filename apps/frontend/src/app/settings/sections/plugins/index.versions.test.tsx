import '@testing-library/jest-dom/vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
// Register the shared API mocks before loading the component's feature modules.
import { chooseRowAction, hoisted, makePlugin, renderWithQuery } from './index.test.hoisted';
import { PluginsSection } from './index';

describe('PluginsSection update checks and version replacement', () => {
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
    expect(await screen.findByRole('radio', { name: /^1\.2\.4 / })).toBeInTheDocument();
  });

  it('shows why the server refused a version replacement and keeps the dialog open', async () => {
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
      if (url.endsWith('/api/plugins/installed/Cool%20Plugin/versions'))
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              version: '1.2.3',
              direction: 'current',
              compatible: true,
              permissionAdditions: [],
              permissionRemovals: [],
            },
            { version: '1.2.4', direction: 'newer', compatible: true, permissionAdditions: [], permissionRemovals: [] },
          ],
        });
      return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
    });
    hoisted.checkAllInstalledPackagesMock.mockResolvedValue([
      {
        ...installed,
        updateCheck: { checkedAt: '2026-09-21T12:00:00.000Z', candidate: '1.2.4', state: 'available', error: null },
      },
    ]);
    hoisted.replaceInstalledPackageMock.mockRejectedValue({
      status: 400,
      body: { message: 'Replacement blocked: storage declaration is invalid' },
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    await user.click(await screen.findByRole('button', { name: 'Check all now' }));
    await user.click(await screen.findByRole('button', { name: 'Review updates' }));
    await user.click(await screen.findByRole('radio', { name: /^1\.2\.4 / }));
    await user.click(screen.getByRole('button', { name: 'Update to 1.2.4' }));

    await waitFor(() =>
      expect(hoisted.errorToast).toHaveBeenCalledWith({
        title: 'Could not replace the plugin',
        description: 'Replacement blocked: storage declaration is invalid',
      }),
    );
    expect(screen.getByRole('radio', { name: /^1\.2\.4 / })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Update to 1.2.4' })).toBeEnabled();
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

  it('shows the installed version when an update waits for the restart, not the one still running', async () => {
    hoisted.plugins = [makePlugin({ version: '1.2.3' })];
    const installed = {
      name: 'Cool Plugin',
      version: '1.2.4',
      installPath: '/plugins/cool',
      registryId: 'npm',
      registryUrl: 'https://registry.npmjs.org',
      classification: 'community',
      classificationReason: 'Marketplace package',
      requestedSpec: null,
      updateOverride: 'inherit',
    };
    hoisted.apiMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [installed] });
      if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/api/plugins/installed/Cool%20Plugin/versions'))
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              version: '1.2.4',
              direction: 'current',
              compatible: true,
              permissionAdditions: [],
              permissionRemovals: [],
            },
          ],
        });
      return Promise.resolve({ ok: true, json: async () => ({ results: [], errors: [] }) });
    });
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    await chooseRowAction(user, 'plugin-1', 'Manage version');

    const current = await screen.findByRole('heading', { name: 'Current version' });
    expect(current.closest('section')).toHaveTextContent('1.2.4');
    expect(current.closest('section')).not.toHaveTextContent('1.2.3');
    expect(await screen.findByRole('textbox', { name: 'Requested version or channel' })).toHaveValue('1.2.4');
  });
});
