import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StandardDrawer } from '../../components/standardDrawer';
import { CsvExportDrawerContent } from './export-drawer';
import { ResourceUsageExport } from './resource-usage';
const state = vi.hoisted(() => ({
  analytics: vi.fn(),
  next: vi.fn(),
  refetch: vi.fn(),
  query: vi.fn(),
  hasNext: false,
  rows: [] as unknown[],
}));
vi.mock('@attraccess/react-query-client', () => ({
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
let blob: Blob | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  state.hasNext = false;
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
];
const items = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];
it('exports the selected columns and previews the same values', async () => {
  const option = vi.fn();
  const refresh = vi.fn();
  render(
    <StandardDrawer isOpen onOpenChange={() => undefined}>
      <CsvExportDrawerContent
        columns={columns}
        items={items}
        filename="users"
        queryStatus="success"
        refetch={refresh}
        options={[{ key: 'group', label: 'Group rows', value: false }]}
        setOption={option}
      />
    </StandardDrawer>,
  );
  expect(screen.getByText('Alice')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Group rows' }));
  expect(option).toHaveBeenCalledWith('group', true);
  fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
  expect(refresh).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  expect(await blob?.text()).toBe('Name;ID\nAlice;1\nBob;2');
  fireEvent.click(screen.getByRole('button', { name: 'None' }));
  expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
});
it.each(['success', 'error'] as const)('waits for all pages and handles a final %s result', async (result) => {
  const fetchAll = vi.fn();
  function Export() {
    const [fetching, setFetching] = useState(false);
    const [status, setStatus] = useState<'success' | 'error'>('success');
    return (
      <StandardDrawer isOpen onOpenChange={() => undefined}>
        <button
          onClick={() => {
            setFetching(false);
            setStatus(result);
          }}
        >
          Finish fetch
        </button>
        <CsvExportDrawerContent
          columns={columns}
          items={items}
          filename="users.csv"
          queryStatus={status}
          onFetchAllPages={() => {
            fetchAll();
            setFetching(true);
          }}
          isFetchingAllPages={fetching}
        />
      </StandardDrawer>
    );
  }
  render(<Export />);
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  expect(fetchAll).toHaveBeenCalledOnce();
  expect(blob).toBeUndefined();
  expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
  fireEvent.click(screen.getByText('Finish fetch'));
  if (result === 'success') {
    await waitFor(() => expect(blob).toBeDefined());
    expect(await blob?.text()).toBe('Name\nAlice\nBob');
  } else {
    expect(blob).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <StandardDrawer isOpen onOpenChange={() => undefined}>
        <ResourceUsageExport start={new Date('2026-09-01T00:00:00Z')} end={new Date('2026-09-02T00:00:00Z')} />
      </StandardDrawer>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download CSV' })).toBeEnabled());
  expect(state.query).toHaveBeenCalledWith({ start: '2026-09-01T00:00:00.000Z', end: '2026-09-02T00:00:00.000Z' });
  expect(state.analytics).toHaveBeenCalledWith({
    requestBody: { resourceIds: [7], start: '2026-09-01T00:00:00.000Z', end: '2026-09-02T00:00:00.000Z' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  await waitFor(() => expect(blob).toBeDefined());
  const csv = await blob!.text();
  expect(csv).toContain('Lathe');
  expect(csv).toContain('3600000;123456');
  expect(csv.split('\n')[0]).toContain('Operating Duration (ms, session)');
  expect(csv).toContain('Prepare;Clean;9;Mentor');
});
