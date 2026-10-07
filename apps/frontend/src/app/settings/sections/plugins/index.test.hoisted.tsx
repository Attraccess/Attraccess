import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import type { DeleteOptions } from './index.contracts';

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
