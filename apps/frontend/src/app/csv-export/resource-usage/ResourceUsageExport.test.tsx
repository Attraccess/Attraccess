import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FieldDefinition } from '../export-config/csv';
import { ResourceUsageExport } from './index';

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  fields: [] as FieldDefinition<unknown>[],
  items: [] as unknown[],
}));
vi.mock('@attraccess/react-query-client', () => ({
  CsvExportType: { RESOURCE_USAGE_HOURS: 'resourceUsageHours' },
  AnalyticsService: {
    getResourceOperatingDurations: () => Object.assign(Promise.resolve({}), { cancel: vi.fn() }),
  },
  useGetResourceUsageHoursInDateRangeInfinite: () => ({
    data: { pages: [{ data: state.rows }] },
    status: 'success',
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('../export-config', () => ({
  CsvExportConfigContent: (props: { fields: FieldDefinition<unknown>[]; items: unknown[] }) => {
    state.fields = props.fields;
    state.items = props.items;
    return <div data-testid="export-config" />;
  },
}));
let testClient: QueryClient;
beforeEach(() => {
  testClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(cleanup);

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
  render(
    <QueryClientProvider client={testClient}>
      <ResourceUsageExport start={new Date('2026-09-01T00:00:00Z')} end={new Date('2026-09-02T00:00:00Z')} />
    </QueryClientProvider>,
  );
  await screen.findByTestId('export-config');
  await waitFor(() => expect(state.fields.some((c) => c.key === 'resourceMetadata.costCenter')).toBe(true));
  const values = (key: string) => {
    const column = state.fields.find((c) => c.key === key);
    return state.items.map((row) => column?.getter(row as never));
  };
  expect(values('userEmail')).toEqual(['alice@example.com', '']);
  expect(values('userExternalIdentifier')).toEqual(['EXT-3', '']);
  expect(values('supervisorEmail')).toEqual(['mentor@example.com', '']);
  expect(values('startNotes')).toEqual(['Prepare', '']);
  expect(values('resourceMetadata.costCenter')).toEqual(['4711', '']);
  expect(values('resourceMetadata.tags')).toEqual(['["a","b"]', '']);
  expect(state.fields.find((c) => c.key === 'resourceMetadata.costCenter')?.label).toBe(
    'Resource metadata: costCenter',
  );
  // existing keys stay stable because templates reference them
  expect(state.fields.slice(0, 17).map((c) => c.key)).toEqual([
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
