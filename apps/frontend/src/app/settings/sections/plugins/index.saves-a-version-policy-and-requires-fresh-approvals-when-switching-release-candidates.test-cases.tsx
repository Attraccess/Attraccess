import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { PluginsSection } from './index';
import type { RootTestRegistrationsTestScope } from './index.test';
export function registerSavesAVersionPolicyAndRequiresFreshApprovalsWhenSwitchingReleaseCandidates(
  scope: RootTestRegistrationsTestScope,
): void {
  it('saves a version policy and requires fresh approvals when switching release candidates', async () => {
    scope.hoisted.plugins = [scope.makePlugin()];
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
    scope.hoisted.updateInstalledPackagePolicyMock.mockResolvedValue({
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
      expect(scope.hoisted.updateInstalledPackagePolicyMock).toHaveBeenCalledWith({
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
      expect(scope.hoisted.replaceInstalledPackageMock).toHaveBeenCalledWith({
        packageName: 'Cool Plugin',
        version: '2.0.0',
        requestBody: { approvedPermissionAdditions: ['write:users'], approvedMajorVersion: true },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Manage Cool Plugin version' })).not.toBeInTheDocument(),
    );
  });
}
