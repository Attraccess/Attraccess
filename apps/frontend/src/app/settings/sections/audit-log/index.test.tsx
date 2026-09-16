import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditEntryDto, AuditMetaDto, AuditSettingsDto } from '@attraccess/react-query-client';
import { AuditLogSection } from './index';

const { list, getMeta, getSettings, updateSettings, permissions } = vi.hoisted(() => ({
  list: vi.fn(),
  getMeta: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  permissions: new Set<string>(),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  AuditService: { auditControllerList: list, auditControllerMeta: getMeta },
  SettingsService: {
    settingsControllerGetAuditSettings: getSettings,
    settingsControllerUpdateAuditSettings: updateSettings,
  },
}));
vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => permissions.has(permission) }),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: ({ en }: { en: Record<string, unknown> }) => ({
    language: 'en',
    t: (key: string) =>
      key
        .split('.')
        .reduce<unknown>(
          (value, part) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined),
          en,
        ) ?? key,
  }),
}));

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
  it('explains missing snapshots and preserves changed-field metadata', async () => {
    list.mockResolvedValue({ items: [{ ...entry, details: { changedFields: '["password"]' } }], nextCursor: null });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'View event #52' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Password')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Not recorded')).toHaveLength(2);
    expect(within(dialog).getByText('["password"]')).toBeInTheDocument();
  });
  it('keeps malformed change metadata visible and identifies current names in the event details', async () => {
    list.mockResolvedValue({
      items: [
        {
          ...entry,
          actorUsernameSource: 'current',
          subjectLabelSource: 'current',
          details: { changedFields: '["truncated' },
        },
      ],
      nextCursor: null,
    });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'View event #52' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('["truncated')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Current name; may have changed since this event')).toHaveLength(2);
    expect(within(dialog).getByText('#7')).toBeInTheDocument();
    expect(within(dialog).getByText('resource #2')).toBeInTheDocument();
  });
  it('opens a readable change comparison and exposes only changed fields', async () => {
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'View event #52' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('What changed')).toBeInTheDocument();
    expect(within(dialog).getByText('Enabled')).toBeInTheDocument();
    expect(within(dialog).getByText('false')).toBeInTheDocument();
    expect(within(dialog).getByText('true')).toBeInTheDocument();
    expect(within(dialog).queryByText('Interval')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Workshop admin')).toBeInTheDocument();
  });

  it('returns from the older page without sending the invalid zero cursor', async () => {
    list.mockImplementation(async ({ beforeId }) => ({
      items: [{ ...entry, id: beforeId ? 50 : 52 }],
      nextCursor: beforeId ? null : 51,
    }));
    mount();
    await screen.findByRole('button', { name: 'View event #52' });
    await userEvent.click(screen.getByRole('button', { name: 'Older' }));
    await screen.findByRole('button', { name: 'View event #50' });
    await userEvent.click(screen.getByRole('button', { name: 'Newer' }));
    await screen.findByRole('button', { name: 'View event #52' });
    expect(list.mock.calls.some(([query]) => query.beforeId === 51)).toBe(true);
    expect(list.mock.calls.some(([query]) => query.beforeId === 0)).toBe(false);
  });

  it('validates IDs before applying filters and preserves the current result on invalid input', async () => {
    mount();
    await screen.findByRole('button', { name: 'View event #52' });
    await userEvent.click(screen.getByRole('button', { name: 'More filters' }));
    await userEvent.type(screen.getByLabelText('Actor ID'), '-1');
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByText('Actor and target IDs must be positive whole numbers.')).toBeInTheDocument();
    expect(list.mock.calls.some(([query]) => query.actorId === -1)).toBe(false);
    await userEvent.clear(screen.getByLabelText('Actor ID'));
    await userEvent.type(screen.getByLabelText('Actor ID'), '7');
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: 7, beforeId: undefined })),
    );
  });

  it('preserves other domains when a plugin domain is switched off, saves and displays persisted settings', async () => {
    mount();
    await userEvent.click(await screen.findByRole('tab', { name: 'Logging settings' }));
    await userEvent.click(await screen.findByRole('switch', { name: 'Demo devices' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        requestBody: { ...settings, plugin_domains_disabled: ['demo'] },
      }),
    );
    expect(await screen.findByText('Logging settings saved.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Billing' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Resources' })).toBeChecked();
  });

  it('keeps an unsaved domain selection after a save failure', async () => {
    updateSettings.mockRejectedValue(new Error('offline'));
    mount();
    await userEvent.click(await screen.findByRole('tab', { name: 'Logging settings' }));
    await userEvent.click(await screen.findByRole('switch', { name: 'Demo devices' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Settings could not be saved. Your changes are still available.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Demo devices' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('does not request or offer management settings to read-only audit users', async () => {
    permissions.delete('system.settings.manage');
    mount();
    await screen.findByRole('button', { name: 'View event #52' });
    expect(getSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab', { name: 'Logging settings' })).not.toBeInTheDocument();
  });

  it('distinguishes failed loading from an empty result and lets the user retry', async () => {
    list.mockRejectedValueOnce(new Error('offline'));
    mount();
    expect(await screen.findByText('Activity could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText('No activity found')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'View event #52' })).toBeInTheDocument();
  });
});
