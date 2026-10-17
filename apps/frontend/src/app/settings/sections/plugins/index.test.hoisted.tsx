import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import type { DeleteOptions } from './types';

import { afterEach, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  deleteMutateMock: vi.fn(),
  dependencyPlan: undefined as unknown,
  dependencyPlanError: null as unknown,
  removalPlan: [] as unknown[],
  removeGraphMock: vi.fn(),
  checkAllInstalledPackagesMock: vi.fn(),
  addRegistryMock: vi.fn(),
  testRegistryMock: vi.fn(),
  removeRegistryMock: vi.fn(),
  installPackageMock: vi.fn(),
  replaceInstalledPackageMock: vi.fn(),
  updateInstalledPackagePolicyMock: vi.fn(),
  retryMutateAsyncMock: vi.fn(),
  statusRefetchMock: vi.fn(),
  successToast: vi.fn(),
  errorToast: vi.fn(),
  showToast: vi.fn(),
  plugins: [] as unknown[],
  pluginSystemStatus: { disabled: false, instanceId: 'original-instance' },
  deleteOptions: undefined as DeleteOptions | undefined,
}));

vi.mock('@attraccess/react-query-client', () => ({
  usePluginsServicePluginControllerDependencyPlan: () => ({
    data: hoisted.dependencyPlan,
    error: hoisted.dependencyPlanError,
    isFetching: false,
  }),
  usePluginsServicePluginControllerRemovalPlan: () => ({ data: hoisted.removalPlan, isFetching: false }),
  usePluginsServicePluginControllerRemovePackageGraph: () => ({
    mutateAsync: hoisted.removeGraphMock,
    isPending: false,
  }),
  usePluginsServiceGetPlugins: () => ({ data: hoisted.plugins }),
  usePluginsServiceGetPluginSystemStatus: () => ({
    data: hoisted.pluginSystemStatus,
    refetch: hoisted.statusRefetchMock,
  }),
  usePluginsServicePluginControllerCheckAllInstalledPackages: () => ({
    mutateAsync: hoisted.checkAllInstalledPackagesMock,
    isPending: false,
  }),
  usePluginsServicePluginControllerAddRegistry: () => ({ mutateAsync: hoisted.addRegistryMock, isPending: false }),
  usePluginsServicePluginControllerTestRegistry: () => ({ mutateAsync: hoisted.testRegistryMock, isPending: false }),
  usePluginsServicePluginControllerRemoveRegistry: () => ({
    mutateAsync: hoisted.removeRegistryMock,
    isPending: false,
  }),
  usePluginsServicePluginControllerInstallPackage: () => ({
    mutateAsync: hoisted.installPackageMock,
    isPending: false,
  }),
  usePluginsServicePluginControllerReplaceInstalledPackage: () => ({
    mutateAsync: hoisted.replaceInstalledPackageMock,
    isPending: false,
  }),
  usePluginsServicePluginControllerUpdateInstalledPackagePolicy: () => ({
    mutateAsync: hoisted.updateInstalledPackagePolicyMock,
    isPending: false,
  }),
  usePluginsServiceRetryPlugin: () => ({ mutateAsync: hoisted.retryMutateAsyncMock, isPending: false }),
  usePluginsServiceDeletePlugin: (options: DeleteOptions) => {
    hoisted.deleteOptions = options;
    return { mutate: hoisted.deleteMutateMock, isPending: false };
  },
  usePluginsServiceUploadPlugin: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({
    success: hoisted.successToast,
    error: hoisted.errorToast,
    showToast: hoisted.showToast,
  }),
}));

export { hoisted };
export function resetTestFixture() {
  hoisted.deleteMutateMock.mockReset();
  hoisted.dependencyPlan = undefined;
  hoisted.dependencyPlanError = null;
  hoisted.removalPlan = [];
  hoisted.removeGraphMock.mockReset();
  hoisted.removeGraphMock.mockResolvedValue({ ok: true });
  hoisted.checkAllInstalledPackagesMock.mockReset();
  hoisted.addRegistryMock.mockReset();
  hoisted.testRegistryMock.mockReset();
  hoisted.removeRegistryMock.mockReset();
  hoisted.installPackageMock.mockReset();
  hoisted.replaceInstalledPackageMock.mockReset();
  hoisted.updateInstalledPackagePolicyMock.mockReset();
  hoisted.retryMutateAsyncMock.mockReset();
  hoisted.statusRefetchMock.mockReset();
  hoisted.successToast.mockReset();
  hoisted.errorToast.mockReset();
  hoisted.plugins = [];
  hoisted.pluginSystemStatus = { disabled: false, instanceId: 'original-instance' };
  hoisted.deleteOptions = undefined;
  hoisted.statusRefetchMock.mockResolvedValue({ data: hoisted.pluginSystemStatus });
  hoisted.retryMutateAsyncMock.mockResolvedValue({ ok: true });
  hoisted.checkAllInstalledPackagesMock.mockResolvedValue([]);
  hoisted.addRegistryMock.mockResolvedValue({});
  hoisted.testRegistryMock.mockResolvedValue({ ok: true });
  hoisted.removeRegistryMock.mockResolvedValue(undefined);
  hoisted.installPackageMock.mockResolvedValue({});
  hoisted.replaceInstalledPackageMock.mockResolvedValue({});
  hoisted.updateInstalledPackagePolicyMock.mockResolvedValue({});
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
beforeEach(resetTestFixture);
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
