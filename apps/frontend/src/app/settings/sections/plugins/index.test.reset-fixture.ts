import { vi } from 'vitest';
import type { SetupScope } from './index.test';

export function resetTestFixture(scope: SetupScope) {
  scope.hoisted.deleteMutateMock.mockReset();
  scope.hoisted.dependencyPlan = undefined;
  scope.hoisted.dependencyPlanError = null;
  scope.hoisted.removalPlan = [];
  scope.hoisted.removeGraphMock.mockReset();
  scope.hoisted.removeGraphMock.mockResolvedValue({ ok: true });
  scope.hoisted.checkAllInstalledPackagesMock.mockReset();
  scope.hoisted.addRegistryMock.mockReset();
  scope.hoisted.testRegistryMock.mockReset();
  scope.hoisted.removeRegistryMock.mockReset();
  scope.hoisted.installPackageMock.mockReset();
  scope.hoisted.replaceInstalledPackageMock.mockReset();
  scope.hoisted.updateInstalledPackagePolicyMock.mockReset();
  scope.hoisted.retryMutateAsyncMock.mockReset();
  scope.hoisted.statusRefetchMock.mockReset();
  scope.hoisted.successToast.mockReset();
  scope.hoisted.errorToast.mockReset();
  scope.hoisted.plugins = [];
  scope.hoisted.pluginSystemStatus = { disabled: false, instanceId: 'original-instance' };
  scope.hoisted.deleteOptions = undefined;
  scope.hoisted.statusRefetchMock.mockResolvedValue({ data: scope.hoisted.pluginSystemStatus });
  scope.hoisted.retryMutateAsyncMock.mockResolvedValue({ ok: true });
  scope.hoisted.checkAllInstalledPackagesMock.mockResolvedValue([]);
  scope.hoisted.addRegistryMock.mockResolvedValue({});
  scope.hoisted.testRegistryMock.mockResolvedValue({ ok: true });
  scope.hoisted.removeRegistryMock.mockResolvedValue(undefined);
  scope.hoisted.installPackageMock.mockResolvedValue({});
  scope.hoisted.replaceInstalledPackageMock.mockResolvedValue({});
  scope.hoisted.updateInstalledPackagePolicyMock.mockResolvedValue({});
  vi.stubGlobal(
    'fetch',
    vi.fn((input: { url?: string } | string) => {
      const url = typeof input === 'string' ? input : (input.url ?? '');
      const plugin = {
        name: '@attraccess/plugin-example',
        version: '1.0.0',
        displayName: 'Example',
        description: 'Official integration',
        permissions: [],
        hostRange: '^1.0.0',
        sdkCompatibility: { backend: '^1.0.0', frontend: null },
        repository: null,
        homepage: null,
        license: 'MIT',
        publisher: 'attraccess',
        deprecated: false,
        registry: { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org' },
        classification: 'official' as const,
        classificationReason: 'Published by Attraccess on npm',
        installable: true,
        incompatibilityReason: null,
        integrity: 'sha512-test',
        provenance: null,
      };
      if (url.includes('/api/plugins/installed')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/api/plugins/registries')) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({
        ok: true,
        json: async () => (url.includes('/marketplace/search') ? { results: [plugin], errors: [] } : plugin),
      });
    }),
  );
}
