import { useState } from 'react';
import {
  cleanup,
  fireEvent,
  render as renderWithoutClient,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CsvExportConfigContent } from './export-config';
import { ResourceUsageExport, useResourceUsageExportState } from './resource-usage';
const state = vi.hoisted(() => ({
  analytics: vi.fn(),
  next: vi.fn(),
  refetch: vi.fn(),
  query: vi.fn(),
  hasNext: false,
  rows: [] as unknown[],
  templates: [] as unknown[],
}));
vi.mock('@attraccess/react-query-client', () => ({
  ApiError: class ApiError extends Error {
    status = 0;
  },
  CsvExportType: { RESOURCE_USAGE_HOURS: 'resourceUsageHours', BILLING_TRANSACTIONS: 'billingTransactions' },
  useAnalyticsServiceGetCsvExportTemplatesKey: 'templates',
  useAnalyticsServiceGetCsvExportTemplates: () => ({ data: state.templates }),
  useAnalyticsServiceCreateCsvExportTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useAnalyticsServiceUpdateCsvExportTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useAnalyticsServiceDeleteCsvExportTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  AnalyticsService: { getResourceOperatingDurations: (...args: unknown[]) => state.analytics(...args) },
  useAnalyticsServiceGetResourceUsageHoursInDateRangeInfinite: (...args: unknown[]) => {
    state.query(...args);
    return {
      data: { pages: [{ data: state.rows }] },
      status: 'success',
      fetchNextPage: state.next,
      hasNextPage: state.hasNext,
      isFetchingNextPage: false,
      refetch: state.refetch,
    };
  },
}));
// The template section reads and writes through react-query; a fresh client per test keeps no cache across tests
let testClient: QueryClient;
const render = ((ui: React.ReactElement, options?: object) =>
  renderWithoutClient(ui, {
    wrapper: ({ children }) => <QueryClientProvider client={testClient}>{children}</QueryClientProvider>,
    ...options,
  })) as typeof renderWithoutClient;
let blob: Blob | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  testClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.hasNext = false;
  state.rows = [];
  state.templates = [];
  blob = undefined;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
    blob = value as Blob;
    return 'blob:csv-test';
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  state.analytics.mockImplementation(() => Object.assign(Promise.resolve({}), { cancel: vi.fn() }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const columns = [
  { key: 'name', label: 'Name', getter: (row: { id: number; name: string }) => row.name, selectedByDefault: true },
  { key: 'id', label: 'ID', getter: (row: { id: number; name: string }) => String(row.id) },
  { key: 'note', label: 'Note', getter: () => 'a;b' },
];
const items = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];
const renderContent = (extra: Partial<React.ComponentProps<typeof CsvExportConfigContent>> = {}) =>
  render(
    <CsvExportConfigContent
      exportType={'resourceUsageHours' as never}
      fields={columns}
      items={items}
      filename="users"
      queryStatus="success"
      {...extra}
    />,
  );
const download = () => screen.getByRole('button', { name: 'Download CSV' });
const previewHeaders = () => screen.getAllByRole('columnheader').map((header) => header.textContent);
/** Opens a HeroUI select (by its data-cy, optionally inside a container) and picks an option. */
const pick = async (cy: string, option: string, container: HTMLElement = document.body) => {
  await userEvent.click(container.querySelector(`[data-cy="${cy}"] button, button[data-cy="${cy}"]`) as HTMLElement);
  await userEvent.click(await screen.findByRole('option', { name: option }));
};
it('starts with the default columns and previews and exports the same values', async () => {
  const option = vi.fn();
  const refresh = vi.fn();
  renderContent({
    refetch: refresh,
    options: [{ key: 'group', label: 'Group rows', value: false }],
    setOption: option,
  });
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByText('Alice')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Group rows' }));
  expect(option).toHaveBeenCalledWith('group', true);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(refresh).toHaveBeenCalledOnce();
  fireEvent.click(download());
  expect(await blob?.text()).toBe('Name\nAlice\nBob');
});
it('adds constant columns, edits headers, reorders and removes columns in preview and download', async () => {
  renderContent();
  fireEvent.click(screen.getByRole('button', { name: 'Add constant column' }));
  const value = document.querySelector('[data-cy="csv-export-column-value"]') as HTMLInputElement;
  fireEvent.change(value, { target: { value: 'maker;space' } });
  const headers = () =>
    Array.from(document.querySelectorAll('[data-cy="csv-export-column-header"]')) as HTMLInputElement[];
  fireEvent.change(headers()[0], { target: { value: 'Person' } });
  fireEvent.change(headers()[1], { target: { value: 'Org' } });
  expect(headers()[0].value).toBe('Person');
  expect(screen.getAllByText('maker;space', { selector: 'td' })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Move column 2 up' }));
  fireEvent.click(download());
  const csv = (await blob?.text()) ?? '';
  expect(csv).toBe('Org;Person\n"maker;space";Alice\n"maker;space";Bob');
  // the preview shows the same order as the file
  await waitFor(() => expect(previewHeaders().join(';')).toBe(csv.split('\n')[0]));
  fireEvent.click(screen.getByRole('button', { name: 'Remove column 1' }));
  fireEvent.click(download());
  expect(await blob?.text()).toBe('Person\nAlice\nBob');
});
it('adds a field column and disables the download without columns', () => {
  renderContent();
  fireEvent.click(screen.getByRole('button', { name: 'Add field column' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Remove column 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove column 1' }));
  expect(download()).toBeDisabled();
});
it.each(['pending', 'error'] as const)('disables the download without rows and while the query is %s', (status) => {
  const view = renderContent({ items: [] });
  expect(download()).toBeDisabled();
  view.rerender(
    <CsvExportConfigContent
      exportType={'resourceUsageHours' as never}
      fields={columns}
      items={items}
      filename="u"
      queryStatus={status}
    />,
  );
  expect(download()).toBeDisabled();
});
it('exports the field picked in a column select under its default label', async () => {
  renderContent();
  await pick('csv-export-column-field', 'ID', screen.getByRole('group', { name: 'Column 1' }));
  await waitFor(() => expect(previewHeaders()).toEqual(['ID']));
  fireEvent.click(download());
  expect(await blob?.text()).toBe('ID\n1\n2');
});
it('exports a selected template exactly and returns to the default columns with "No template"', async () => {
  state.templates = [
    {
      id: 5,
      name: 'Accounting',
      exportType: 'resourceUsageHours',
      columns: [
        { type: 'constant', header: 'Org', value: 'maker;space' },
        { type: 'field', header: 'Person', fieldKey: 'name' },
      ],
    },
  ];
  renderContent();
  await pick('csv-export-template-select', 'Accounting');
  fireEvent.click(download());
  expect(await blob?.text()).toBe('Org;Person\n"maker;space";Alice\n"maker;space";Bob');
  await pick('csv-export-template-select', 'No template (default columns)');
  fireEvent.click(download());
  expect(await blob?.text()).toBe('Name\nAlice\nBob');
});
it('keeps the default column rows mounted when the field list is rebuilt', () => {
  const view = renderContent();
  const row = screen.getByRole('group', { name: 'Column 1' });
  // a refetch or page arrival rebuilds every field definition, plus newly found metadata keys
  view.rerender(
    <CsvExportConfigContent
      exportType={'resourceUsageHours' as never}
      fields={[
        ...columns.map((column) => ({ ...column })),
        { key: 'resourceMetadata.room', label: 'Room', getter: () => 'r' },
      ]}
      items={items}
      filename="u"
      queryStatus="success"
    />,
  );
  expect(screen.getByRole('group', { name: 'Column 1' })).toBe(row);
});
it('disables "Add field column" until there are fields to pick', () => {
  renderContent({ fields: [] });
  expect(screen.getByRole('button', { name: 'Add field column' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add constant column' })).toBeEnabled();
});
it('flags a missing metadata field only once every page is loaded', async () => {
  state.hasNext = true;
  state.rows = [
    { id: 11, resourceId: 7, resource: { id: 7, name: 'Lathe', metadata: null }, user: { id: 3 }, usageInMinutes: 1 },
  ];
  state.templates = [
    {
      id: 5,
      name: 'Rooms',
      exportType: 'resourceUsageHours',
      columns: [
        { type: 'field', header: '', fieldKey: 'resourceMetadata.room' },
        { type: 'field', header: '', fieldKey: 'gone' },
      ],
    },
  ];
  render(<ResourceUsageExport start={new Date('2026-09-01T00:00:00Z')} end={new Date('2026-09-02T00:00:00Z')} />);
  await waitFor(() => expect(download()).toBeEnabled());
  await pick('csv-export-template-select', 'Rooms');
  // the metadata key may still show up on a later page; an unknown plain key cannot
  const flagged = () => document.querySelectorAll('[data-cy="csv-export-column-unavailable"]');
  expect(flagged()).toHaveLength(1);
  expect(
    within(screen.getByRole('group', { name: 'Column 2' })).getByText('Not available in current data'),
  ).toBeVisible();
});
it('keeps edits when data fields change after the columns were edited', () => {
  const view = renderContent();
  fireEvent.click(screen.getByRole('button', { name: 'Add constant column' }));
  view.rerender(
    <CsvExportConfigContent
      exportType={'resourceUsageHours' as never}
      fields={[...columns, { key: 'late', label: 'Late', getter: () => 'x' }]}
      items={items}
      filename="u"
      queryStatus="success"
    />,
  );
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
});
it('flags a configured field that is missing from the data but keeps the column', async () => {
  const view = renderContent();
  fireEvent.click(screen.getByRole('button', { name: 'Add constant column' }));
  view.rerender(
    <CsvExportConfigContent
      exportType={'resourceUsageHours' as never}
      fields={[{ key: 'other', label: 'Other', getter: () => 'o' }]}
      items={items}
      filename="u"
      queryStatus="success"
    />,
  );
  expect(document.querySelectorAll('[data-cy="csv-export-column-unavailable"]')).toHaveLength(1);
  expect(screen.getByText('Not available in current data')).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  fireEvent.click(download());
  expect(await blob?.text()).toBe('name;\n;\n;');
});
it.each(['success', 'error'] as const)('waits for all pages and handles a final %s result', async (result) => {
  const fetchAll = vi.fn();
  function Export() {
    const [fetching, setFetching] = useState(false);
    const [status, setStatus] = useState<'success' | 'error'>('success');
    return (
      <>
        <button
          onClick={() => {
            setFetching(false);
            setStatus(result);
          }}
        >
          Finish fetch
        </button>
        <CsvExportConfigContent
          exportType={'resourceUsageHours' as never}
          fields={columns}
          items={items}
          filename="users.csv"
          queryStatus={status}
          onFetchAllPages={() => {
            fetchAll();
            setFetching(true);
          }}
          isFetchingAllPages={fetching}
        />
      </>
    );
  }
  render(<Export />);
  fireEvent.click(download());
  expect(fetchAll).toHaveBeenCalledOnce();
  expect(blob).toBeUndefined();
  expect(download()).toBeDisabled();
  fireEvent.click(screen.getByText('Finish fetch'));
  if (result === 'success') {
    await waitFor(() => expect(blob).toBeDefined());
    expect(await blob?.text()).toBe('Name\nAlice\nBob');
  } else {
    expect(blob).toBeUndefined();
    expect(download()).toBeDisabled();
  }
});
it('includes session and operating duration columns in resource usage downloads', async () => {
  state.analytics.mockImplementation(() =>
    Object.assign(
      Promise.resolve({
        7: { operatingDataAvailable: true, isProvisional: false, attributions: [{ usageId: 11, durationMs: 123456 }] },
      }),
      { cancel: vi.fn() },
    ),
  );
  state.rows = [
    {
      id: 11,
      resourceId: 7,
      resource: { id: 7, name: 'Lathe' },
      user: { id: 3, username: 'Alice' },
      startTime: '2026-09-01T10:00:00Z',
      endTime: '2026-09-01T11:00:00Z',
      usageInMinutes: 60,
      startNotes: 'Prepare',
      endNotes: 'Clean',
      supervisorUserId: 9,
      supervisorUser: { username: 'Mentor' },
    },
  ];
  render(<ResourceUsageExport start={new Date('2026-09-01T00:00:00Z')} end={new Date('2026-09-02T00:00:00Z')} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download CSV' })).toBeEnabled());
  // a window refocus must not refetch every page after "fetch all"
  expect(state.query).toHaveBeenCalledWith(
    { start: '2026-09-01T00:00:00.000Z', end: '2026-09-02T00:00:00.000Z' },
    undefined,
    { refetchOnWindowFocus: false },
  );
  expect(state.analytics).toHaveBeenCalledWith({
    requestBody: { resourceIds: [7], start: '2026-09-01T00:00:00.000Z', end: '2026-09-02T00:00:00.000Z' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  await waitFor(() => expect(blob).toBeDefined());
  // no template: exactly the export type's default columns, in the historic order
  expect(((await blob?.text()) ?? '').split('\n')).toEqual([
    'Resource ID;Resource Name;User ID;User Name;Usage in Hours;Exact Session Duration (ms);' +
      'Operating Duration (ms, session);Operating Data Status',
    '7;Lathe;3;Alice;1;3600000;123456;',
  ]);
});
it('offers email, external identifier, notes and resource metadata fields', async () => {
  state.rows = [
    {
      id: 11,
      resourceId: 7,
      resource: { id: 7, name: 'Lathe', metadata: { costCenter: '4711', tags: ['a', 'b'] } },
      user: { id: 3, username: 'Alice', externalIdentifier: 'EXT-3' },
      userEmail: 'alice@example.com',
      supervisorEmail: 'mentor@example.com',
      startTime: '2026-09-01T10:00:00Z',
      endTime: '2026-09-01T11:00:00Z',
      usageInMinutes: 60,
      startNotes: 'Prepare',
      endNotes: 'Clean',
      supervisorUserId: 9,
      supervisorUser: { username: 'Mentor' },
    },
    { id: 12, resourceId: 7, resource: { id: 7, name: 'Lathe', metadata: null }, user: { id: 4 }, usageInMinutes: 1 },
  ];
  const { result } = renderHook(
    () =>
      useResourceUsageExportState({
        start: new Date('2026-09-01T00:00:00Z'),
        end: new Date('2026-09-02T00:00:00Z'),
      }),
    { wrapper: ({ children }) => <QueryClientProvider client={testClient}>{children}</QueryClientProvider> },
  );
  await waitFor(() => expect(result.current.columns.some((c) => c.key === 'resourceMetadata.costCenter')).toBe(true));
  const values = (key: string) => {
    const column = result.current.columns.find((c) => c.key === key);
    return result.current.resourceUsageExport.map((row) => column?.getter(row as never));
  };
  expect(values('userEmail')).toEqual(['alice@example.com', '']);
  expect(values('userExternalIdentifier')).toEqual(['EXT-3', '']);
  expect(values('supervisorEmail')).toEqual(['mentor@example.com', '']);
  expect(values('startNotes')).toEqual(['Prepare', '']);
  expect(values('resourceMetadata.costCenter')).toEqual(['4711', '']);
  expect(values('resourceMetadata.tags')).toEqual(['["a","b"]', '']);
  expect(result.current.columns.find((c) => c.key === 'resourceMetadata.costCenter')?.label).toBe(
    'Resource metadata: costCenter',
  );
  // existing keys stay stable because templates reference them
  expect(result.current.columns.slice(0, 17).map((c) => c.key)).toEqual([
    'resourceId',
    'resourceName',
    'userId',
    'username',
    'startTimeISO',
    'startTime',
    'endTimeISO',
    'endTime',
    'usageInMinutes',
    'usageInHours',
    'sessionDurationMs',
    'operatingDurationMs',
    'durationStatus',
    'startNotes',
    'endNotes',
    'supervisorId',
    'supervisorUsername',
  ]);
});
