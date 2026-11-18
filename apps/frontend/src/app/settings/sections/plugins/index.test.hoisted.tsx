import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { PropsWithChildren, ReactElement } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';

interface DeleteOptions {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

/** What the fake API answers for a GET: a failed request has `ok: false`. */
interface ApiResponse {
  ok: boolean;
  json?: () => Promise<unknown>;
}

const hoisted = vi.hoisted(() => ({
  /** The fake API behind the mocked query hooks: answers a GET request path. */
  apiMock: vi.fn<(path: string) => Promise<ApiResponse>>(),
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

vi.mock('@attraccess/react-query-client', async () => {
  const { useQuery } = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  // The generated query hooks read from the fake API, so tests describe the API as HTTP-like responses per path.
  const fetchJson = async (path: string) => {
    const response = await hoisted.apiMock(path);
    if (!response.ok || !response.json) throw new Error(`Request failed: ${path}`);
    return response.json();
  };
  const withRegistry = (registryId?: string, separator = '?') =>
    registryId ? `${separator}registryId=${encodeURIComponent(registryId)}` : '';
  return {
    UsePluginControllerInstalledPackagesKeyFn: () => ['installed'],
    UsePluginControllerListRegistriesKeyFn: () => ['registries'],
    usePluginControllerInstalledPackages: (_clientOptions: unknown, _key: unknown, options: object) =>
      useQuery({ queryKey: ['installed'], queryFn: () => fetchJson('/api/plugins/installed'), ...options }),
    usePluginControllerListRegistries: (_clientOptions: unknown, _key: unknown, options: object) =>
      useQuery({ queryKey: ['registries'], queryFn: () => fetchJson('/api/plugins/registries'), ...options }),
    usePluginControllerSearchMarketplace: (
      { query: { query, registryId } }: { query: { query: string; registryId?: string } },
      _key: unknown,
      options: object,
    ) =>
      useQuery({
        queryKey: ['search', query, registryId],
        queryFn: () =>
          fetchJson(
            `/api/plugins/marketplace/search?query=${encodeURIComponent(query)}${withRegistry(registryId, '&')}`,
          ),
        ...options,
      }),
    usePluginControllerMarketplacePackage: (
      {
        path: { packageName },
        query: { registryId } = {},
      }: { path: { packageName: string }; query?: { registryId?: string } },
      _key: unknown,
      options: object,
    ) =>
      useQuery({
        queryKey: ['package', packageName, registryId],
        queryFn: () =>
          fetchJson(`/api/plugins/marketplace/${encodeURIComponent(packageName)}${withRegistry(registryId)}`),
        ...options,
      }),
    usePluginControllerInstalledPackageVersions: (
      { path: { packageName } }: { path: { packageName: string } },
      _key: unknown,
      options: object,
    ) =>
      useQuery({
        queryKey: ['versions', packageName],
        queryFn: () => fetchJson(`/api/plugins/installed/${encodeURIComponent(packageName)}/versions`),
        ...options,
      }),
    usePluginControllerDependencyPlan: () => ({
      data: hoisted.dependencyPlan,
      error: hoisted.dependencyPlanError,
      isFetching: false,
    }),
    usePluginControllerRemovalPlan: () => ({ data: hoisted.removalPlan, isFetching: false }),
    usePluginControllerRemovePackageGraph: () => ({
      mutateAsync: hoisted.removeGraphMock,
      isPending: false,
    }),
    useGetPlugins: () => ({ data: hoisted.plugins }),
    useGetPluginSystemStatus: () => ({
      data: hoisted.pluginSystemStatus,
      refetch: hoisted.statusRefetchMock,
    }),
    usePluginControllerCheckAllInstalledPackages: () => ({
      mutateAsync: hoisted.checkAllInstalledPackagesMock,
      isPending: false,
    }),
    usePluginControllerAddRegistry: () => ({ mutateAsync: hoisted.addRegistryMock, isPending: false }),
    usePluginControllerTestRegistry: () => ({ mutateAsync: hoisted.testRegistryMock, isPending: false }),
    usePluginControllerRemoveRegistry: () => ({
      mutateAsync: hoisted.removeRegistryMock,
      isPending: false,
    }),
    usePluginControllerInstallPackage: () => ({
      mutateAsync: hoisted.installPackageMock,
      isPending: false,
    }),
    usePluginControllerReplaceInstalledPackage: () => ({
      mutateAsync: hoisted.replaceInstalledPackageMock,
      isPending: false,
    }),
    usePluginControllerUpdateInstalledPackagePolicy: () => ({
      mutateAsync: hoisted.updateInstalledPackagePolicyMock,
      isPending: false,
    }),
    useRetryPlugin: () => ({ mutateAsync: hoisted.retryMutateAsyncMock, isPending: false }),
    useDeletePlugin: (_mutationKey: unknown, options: DeleteOptions) => {
      hoisted.deleteOptions = options;
      return { mutate: hoisted.deleteMutateMock, isPending: false };
    },
    useUploadPlugin: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock('../../../readerUi/ReaderUiAlerts', () => ({ ReaderUiAlerts: () => null }));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({
    success: hoisted.successToast,
    error: hoisted.errorToast,
    showToast: hoisted.showToast,
  }),
}));

export { hoisted };

let queryClient = new QueryClient();
function QueryWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
/** Renders with a fresh query client per test; rerender keeps the same wrapper. */
export function renderWithQuery(ui: ReactElement) {
  return render(ui, { wrapper: QueryWrapper });
}

export function resetTestFixture() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  hoisted.apiMock.mockReset();
  hoisted.apiMock.mockImplementation((url) => {
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
  });
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
/** Picks an item from a plugin row's actions menu, where Details, Manage version and Remove plugin live. */
export async function chooseRowAction(user: UserEvent, pluginId: string, item: string) {
  const trigger = await waitFor(() => {
    const element = document.querySelector(`[data-cy="plugins-list-actions-button-${pluginId}"]`);
    if (!element) throw new Error(`No actions menu for ${pluginId}`);
    return element;
  });
  await user.click(trigger);
  await user.click(await screen.findByRole('menuitem', { name: item }));
}
beforeEach(resetTestFixture);
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
