import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { PluginsSection } from './index';
import { registerShowsDirectAndTransitivePluginsReuseStatusAndPermissionsBeforeOneConfirmation } from './index.retries-a-failed-plugin-when-the-restarted-server-becomes-available-without-observing-downtime.test-cases';
import { registerSurfacesDependencyConflictsAndKeepsInstallationDisabled } from './index.retries-a-failed-plugin-when-the-restarted-server-becomes-available-without-observing-downtime.test-cases';
import { registerRequiresRenewedApprovalWhenARefreshedInstallPlanChangesDependencyPermissions } from './index.renders-community-for-an-installed-plugin-until-its-npm-classification-is-available.test-cases';
import { registerShowsRefreshedRootPermissionsAndClassificationBeforeRenewedApproval } from './index.retries-a-failed-plugin-when-the-restarted-server-becomes-available-without-observing-downtime.test-cases';
import { registerRequiresExplicitApprovalOfAllDependantsBeforeRemovingADependency } from './index.renders-community-for-an-installed-plugin-until-its-npm-classification-is-available.test-cases';
import { hoisted } from './index.test.hoisted';
import { registerSavesAVersionPolicyAndRequiresFreshApprovalsWhenSwitchingReleaseCandidates } from './index.saves-a-version-policy-and-requires-fresh-approvals-when-switching-release-candidates.test-cases';
import { registerOpensInstalledPackageDetailsFromTheOriginalRegistry } from './index.keeps-the-marketplace-loading-indicator-visible-while-details-are-pending-after-a-search-completes.test-cases';

export function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

export function makePlugin(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plugin-1',
    name: 'Cool Plugin',
    version: '1.2.3',
    pluginDirectory: '/plugins/cool',
    permissions: ['read:resources', 'write:resources'],
    ...overrides,
  };
}

export function definePluginDependencyConfirmationsTests() {
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
  const scope = {
    get hoisted() {
      return hoisted;
    },
    get provider() {
      return provider;
    },
    get core() {
      return core;
    },
    get adapter() {
      return adapter;
    },
    get openProvider() {
      return openProvider;
    },
    makePlugin,
  };
  registerShowsDirectAndTransitivePluginsReuseStatusAndPermissionsBeforeOneConfirmation(scope);
  registerSurfacesDependencyConflictsAndKeepsInstallationDisabled(scope);
  registerRequiresRenewedApprovalWhenARefreshedInstallPlanChangesDependencyPermissions(scope);
  registerShowsRefreshedRootPermissionsAndClassificationBeforeRenewedApproval(scope);

  registerRequiresExplicitApprovalOfAllDependantsBeforeRemovingADependency(scope);

  return scope;
}

export function defineRootTestRegistrationsTests() {
  const scope = {
    get hoisted() {
      return hoisted;
    },
    makePlugin,
  };

  registerSavesAVersionPolicyAndRequiresFreshApprovalsWhenSwitchingReleaseCandidates(scope);

  registerOpensInstalledPackageDetailsFromTheOriginalRegistry(scope);

  return scope;
}

export function getSetupScope() {
  return {
    get hoisted() {
      return hoisted;
    },
  };
}
