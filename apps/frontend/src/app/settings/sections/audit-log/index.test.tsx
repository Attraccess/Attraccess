import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditEntryDto, AuditMetaDto, AuditSettingsDto } from '@attraccess/react-query-client';
import { AuditLogSection } from './index';
import { registerShowsLocalizedSettingsAndPreservesApiTokenAndRequestProvenanceInTheDetails } from './index.test-cases';
import { registerExplainsMissingSnapshotsAndPreservesChangedFieldMetadata } from './index.test-cases';
import { registerKeepsMalformedChangeMetadataVisibleAndIdentifiesCurrentNamesInTheEventDetails } from './index.test-cases';
import { registerOpensAReadableChangeComparisonAndExposesOnlyChangedFields } from './index.test-cases';
import { registerReturnsFromTheOlderPageWithoutSendingTheInvalidZeroCursor } from './index.test-cases';
import { registerValidatesIdsBeforeApplyingFiltersAndPreservesTheCurrentResultOnInvalidInput } from './index.test-cases';
import { registerPreservesOtherDomainsWhenAPluginDomainIsSwitchedOffSavesAndDisplaysPersistedSettings } from './index.test-cases';
import { registerKeepsAnUnsavedDomainSelectionAfterASaveFailure } from './index.test-cases';
import { registerDoesNotRequestOrOfferManagementSettingsToReadOnlyAuditUsers } from './index.test-cases';
import { registerDistinguishesFailedLoadingFromAnEmptyResultAndLetsTheUserRetry } from './index.test-cases';

const { list, getMeta, getSettings, updateSettings, permissions } = vi.hoisted(() => ({
  list: vi.fn(),
  getMeta: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  permissions: new Set<string>(),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@attraccess/react-query-client')>();
  // Route the generated hooks through the real react-query primitives into the test
  // doubles, so caching, retries and key-driven refetches behave as in production.
  const { useMutation, useQuery } = await import('@tanstack/react-query');
  return {
    ...original,
    AuditService: { auditControllerList: list },
    useAuditServiceAuditControllerList: (params?: object, _queryKey?: unknown, options?: object) =>
      useQuery({
        queryKey: original.UseAuditServiceAuditControllerListKeyFn(params as never),
        queryFn: () => list(params),
        ...options,
      }),
    useAuditServiceAuditControllerMeta: (_queryKey?: unknown, options?: object) =>
      useQuery({
        queryKey: original.UseAuditServiceAuditControllerMetaKeyFn(),
        queryFn: () => getMeta(),
        ...options,
      }),
    useSettingsServiceSettingsControllerGetAuditSettings: (_queryKey?: unknown, options?: object) =>
      useQuery({
        queryKey: original.UseSettingsServiceSettingsControllerGetAuditSettingsKeyFn(),
        queryFn: () => getSettings(),
        ...options,
      }),
    useSettingsServiceSettingsControllerUpdateAuditSettings: (options?: object) =>
      useMutation({
        mutationFn: (variables: { requestBody: unknown }) => updateSettings(variables),
        ...options,
      }),
  };
});
vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => permissions.has(permission) }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async () => {
  const { get } = await import('lodash-es');
  return {
    useTranslations: ({ en }: { en: Record<string, unknown> }) => ({
      language: 'en',
      t: (key: string) => get(en, key, key),
    }),
  };
});

const entry: AuditEntryDto = {
  id: 52,
  at: '2026-09-13T12:00:00.000Z',
  domain: 'resource',
  pluginId: 'core',
  action: 'maintenance_schedule.updated',
  operationId: 'audit-operation',
  actorId: 7,
  actorUsername: 'Workshop admin',
  authenticationMethod: 'session',
  apiTokenId: null,
  outcome: 'succeeded',
  subjectType: 'resource',
  subjectId: 2,
  subjectLabel: 'Laser cutter',
  details: {
    before: JSON.stringify({ enabled: false, interval: 7 }),
    after: JSON.stringify({ enabled: true, interval: 7 }),
    scheduleId: 5,
  },
};
const settings: AuditSettingsDto = {
  enabled: true,
  domains: ['billing', 'resource'],
  plugin_domains_disabled: [],
  retention_days: 90,
};
// Plugin domains come from the API meta endpoint; the UI never hardcodes one.
const meta: AuditMetaDto = {
  domains: [
    { id: 'billing', source: 'core' },
    { id: 'resource', source: 'core' },
    { id: 'demo', source: 'plugin', labels: { en: 'Demo devices', de: 'Demo-Geräte' } },
  ],
  subjectTypes: ['resource', 'billing.transaction', 'demo.device'],
  actions: ['resource.updated', 'demo.publication'],
};
let client: QueryClient;
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuditLogSection />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  // happy-dom does not implement the Web Animations API used by HeroUI's tab indicator.
  if (!Element.prototype.getAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
  vi.clearAllMocks();
  permissions.clear();
  permissions.add('system.audit.read');
  permissions.add('system.settings.manage');
  list.mockResolvedValue({ items: [entry], nextCursor: 51 });
  getMeta.mockResolvedValue(meta);
  getSettings.mockResolvedValue(settings);
  updateSettings.mockImplementation(async ({ requestBody }) => requestBody);
});
afterEach(() => {
  cleanup();
  client?.clear();
});

describe('audit admin workflows', () => {
  defineAuditAdminWorkflowsTests();
});

it('exports filtered audit entries as CSV and revokes the download URL', async () => {
  list.mockResolvedValue({ items: [entry], nextCursor: null });
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:audit-export');
  const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    expect(this.download).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(this.href).toBe('blob:audit-export');
  });
  try {
    mount();
    await screen.findAllByText('Laser cutter');
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    const blob = createUrl.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8');
    const csv = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(csv).toContain('maintenance_schedule.updated');
    expect(csv).toContain('Workshop admin');
    expect(csv).toContain('Laser cutter');
    expect(revokeUrl).toHaveBeenCalledWith('blob:audit-export');
  } finally {
    createUrl.mockRestore();
    revokeUrl.mockRestore();
    download.mockRestore();
  }
});

it('reports an export failure and allows retry without downloading partial data', async () => {
  mount();
  await screen.findAllByText('Laser cutter');
  list.mockRejectedValue(new Error('Offline'));
  await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
  expect(await screen.findByText('Export failed. Please try again.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Export CSV' })).not.toBeDisabled();
});

export function defineAuditAdminWorkflowsTests() {
  const scope = {
    get list() {
      return list;
    },
    get entry() {
      return entry;
    },
    mount,
    get updateSettings() {
      return updateSettings;
    },
    get settings() {
      return settings;
    },
    get permissions() {
      return permissions;
    },
    get getSettings() {
      return getSettings;
    },
  };
  registerShowsLocalizedSettingsAndPreservesApiTokenAndRequestProvenanceInTheDetails(scope);
  registerExplainsMissingSnapshotsAndPreservesChangedFieldMetadata(scope);
  registerKeepsMalformedChangeMetadataVisibleAndIdentifiesCurrentNamesInTheEventDetails(scope);
  registerOpensAReadableChangeComparisonAndExposesOnlyChangedFields(scope);

  registerReturnsFromTheOlderPageWithoutSendingTheInvalidZeroCursor(scope);

  registerValidatesIdsBeforeApplyingFiltersAndPreservesTheCurrentResultOnInvalidInput(scope);

  registerPreservesOtherDomainsWhenAPluginDomainIsSwitchedOffSavesAndDisplaysPersistedSettings(scope);

  registerKeepsAnUnsavedDomainSelectionAfterASaveFailure(scope);

  registerDoesNotRequestOrOfferManagementSettingsToReadOnlyAuditUsers(scope);

  registerDistinguishesFailedLoadingFromAnEmptyResultAndLetsTheUserRetry(scope);

  return scope;
}

export type AuditAdminWorkflowsTestScope = ReturnType<typeof defineAuditAdminWorkflowsTests>;
