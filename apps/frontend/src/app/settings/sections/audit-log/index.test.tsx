// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditEntryDto, AuditMetaDto, AuditSettingsDto } from '@attraccess/react-query-client';
import { AuditLogSection } from './index';

// Allow query notifications to settle when the shared CI/dev host is busy.
configure({ asyncUtilTimeout: 10000 });

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
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => {
  const { get } = await import('lodash-es');
  return {
    ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
    useTranslations: ({ en }: { en: Record<string, unknown> }) => ({
      language: 'en',
      t: (key: string) => get(en, key, key),
    }),
  };
});

const entry: AuditEntryDto = {
  id: 52,
  at: '2026-09-13T12:00:37.000Z',
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
  // jsdom lacks the layout observers and animation API used by HeroUI's tabs.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        /* No layout in jsdom. */
      }
      unobserve() {
        /* No layout in jsdom. */
      }
      disconnect() {
        /* No layout in jsdom. */
      }
    },
  );
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
  vi.unstubAllGlobals();
});

describe('audit admin workflows', () => {
  it.each(['From', 'To'])(
    'blocks applying an incomplete %s date until completed or cleared',
    async (label) => {
      const user = userEvent.setup();
      mount();
      await screen.findByRole('button', { name: 'View event #52' });
      const field = within(screen.getAllByRole('group', { name: label })[0]);
      const apply = screen.getByRole('button', { name: 'Apply filters' });
      for (const [segment, value] of [
        ['month', '11'],
        ['day', '23'],
        ['year', '2026'],
        ['hour', '05'],
        ['minute', '45'],
        ['AM/PM', 'a'],
      ]) {
        await user.click(field.getByRole('spinbutton', { name: new RegExp(`^${segment},`) }));
        await user.keyboard(value);
      }
      expect(apply).toBeEnabled();
      await user.click(field.getByRole('spinbutton', { name: /^day,/ }));
      await user.keyboard('{Backspace}{Backspace}');
      expect(apply).toBeDisabled();
      expect(screen.getByText('Enter valid dates.')).toBeInTheDocument();
      const requestsBefore = list.mock.calls.length;
      await user.click(apply);
      // Guard the submit handler too, including submissions that bypass the button.
      const filterForm = apply.closest('form');
      if (!filterForm) throw new Error('Missing filter form');
      fireEvent.submit(filterForm);
      expect(list).toHaveBeenCalledTimes(requestsBefore);
      await user.click(field.getByRole('spinbutton', { name: /^day,/ }));
      await user.keyboard('24');
      expect(apply).toBeEnabled();
      await user.click(apply);
      const key = label.toLowerCase();
      await waitFor(() =>
        expect(list).toHaveBeenLastCalledWith(
          expect.objectContaining({
            [key]: new Date('2026-11-24T05:45').toISOString(),
          }),
        ),
      );
      await user.click(field.getByRole('spinbutton', { name: /^day,/ }));
      await user.keyboard('{Backspace}{Backspace}');
      await user.click(field.getByRole('button', { name: `Clear date: ${label}` }));
      expect(apply).toBeEnabled();
      await user.click(apply);
      await waitFor(() => expect(list.mock.lastCall?.[0]).not.toHaveProperty(key));
    },
    60000,
  );
  it('shows localized settings and preserves API-token and request provenance in the details', async () => {
    list.mockResolvedValue({
      items: [
        {
          ...entry,
          domain: 'administration',
          action: 'settings.updated',
          subjectType: 'setting',
          subjectId: 123456,
          authenticationMethod: 'api-token',
          apiTokenId: 19,
          ipAddress: '192.0.2.7',
          userAgent: 'Audit verification client',
          details: { settingKey: 'audit.enabled', before: 'true', after: 'false' },
        },
      ],
      nextCursor: null,
    });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'View event #52' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        new Intl.DateTimeFormat('en', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date(entry.at)),
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Audit logging')).toBeInTheDocument();
    expect(within(dialog).getByText('settings.updated')).toBeInTheDocument();
    expect(within(dialog).getByText('setting #123456')).toBeInTheDocument();
    expect(within(dialog).getByText('api-token')).toBeInTheDocument();
    expect(within(dialog).getByText('#19')).toBeInTheDocument();
    expect(within(dialog).getByText('192.0.2.7')).toBeInTheDocument();
    expect(within(dialog).getByText('Audit verification client')).toBeInTheDocument();
    expect(within(dialog).getByText('audit.enabled')).toBeInTheDocument();
  });
  it('explains missing snapshots and preserves changed-field metadata', async () => {
    list.mockResolvedValue({ items: [{ ...entry, details: { changedFields: '["password"]' } }], nextCursor: null });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'View event #52' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Password')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Not recorded')).toHaveLength(2);
    const changedFields = within(dialog).getByText(/\[\s*"password"\s*\]/);
    expect(JSON.parse(changedFields.textContent ?? '')).toEqual(['password']);
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

  it('clears partially typed dates when resetting all filters', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole('button', { name: 'View event #52' });
    fireEvent.change(screen.getByLabelText('Event prefix'), { target: { value: 'resource.' } });
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ eventPrefix: 'resource.' })));
    const from = within(screen.getAllByRole('group', { name: 'From' })[0]);
    await user.click(from.getByRole('spinbutton', { name: /^month,/ }));
    await user.keyboard('11');
    expect(screen.getByRole('button', { name: 'Apply filters' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Clear filters/ }));
    expect(screen.getByRole('button', { name: 'Apply filters' })).toBeEnabled();
    expect(screen.queryByText('Enter valid dates.')).not.toBeInTheDocument();
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

it('exports filtered audit entries as CSV and revokes the download URL', async () => {
  list.mockResolvedValue({ items: [entry], nextCursor: null });
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn();
      static revokeObjectURL = vi.fn();
    },
  );
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
