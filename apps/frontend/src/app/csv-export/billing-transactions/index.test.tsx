import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FieldDefinition } from '../export-config/csv';
import { BillingTransactionsExport } from '.';

const state = vi.hoisted(() => ({
  fields: [] as FieldDefinition<unknown>[],
  items: [] as unknown[],
  query: vi.fn(),
  rows: [] as unknown[],
  hasNext: false,
}));

vi.mock('@attraccess/react-query-client', () => ({
  ApiError: class ApiError extends Error {
    status = 0;
  },
  CsvExportType: { RESOURCE_USAGE_HOURS: 'resourceUsageHours', BILLING_TRANSACTIONS: 'billingTransactions' },
  useAnalyticsServiceGetCsvExportTemplatesKey: 'templates',
  useAnalyticsServiceGetCsvExportTemplates: () => ({ data: [] }),
  useAnalyticsServiceCreateCsvExportTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useAnalyticsServiceUpdateCsvExportTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useAnalyticsServiceDeleteCsvExportTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useBillingServiceGetBillingConfiguration: () => ({ data: { minorUnit: 2 }, status: 'success' }),
  useAnalyticsServiceGetBillingTransactionsInDateRangeInfinite: (...args: unknown[]) => {
    state.query(...args);
    return {
      data: { pages: [{ data: state.rows }] },
      status: 'success',
      fetchNextPage: vi.fn(),
      hasNextPage: state.hasNext,
      isFetchingNextPage: false,
    };
  },
}));

// Records what the export hands to the config UI, which still renders for real.
vi.mock('../export-config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../export-config')>();
  return {
    ...original,
    CsvExportConfigContent: (props: Parameters<typeof original.CsvExportConfigContent>[0]) => {
      state.fields = props.fields as FieldDefinition<unknown>[];
      state.items = props.items as unknown[];
      return original.CsvExportConfigContent(props);
    },
  };
});
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const range = { start: new Date('2026-09-01T00:00:00Z'), end: new Date('2026-09-02T00:00:00Z') };

const transaction = {
  id: 21,
  userId: 3,
  user: { id: 3, username: 'Alice', externalIdentifier: 'EXT-3' },
  userEmail: 'alice@example.com',
  createdAt: '2026-09-01T10:00:00Z',
  amount: 1250,
  initiator: { id: 9, username: 'Mentor' },
  initiatorEmail: 'mentor@example.com',
  resourceUsage: { resource: { name: 'Lathe', metadata: { costCenter: '4711', tags: ['a', 'b'] } } },
  refundOfId: null,
  correctionOfId: 4,
  externalReference: 'INV-1',
  status: 'completed',
  items: [{ quantity: 2, name: 'Wood', unitPrice: 300 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.rows = [];
  state.hasNext = false;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('offers user id, emails, external identifier and resource metadata fields after the existing ones', async () => {
  state.rows = [
    transaction,
    // no resource usage, emails withheld by the API (caller without billing.manage / reports permission)
    {
      ...transaction,
      id: 22,
      user: { id: 4, username: 'Bob' },
      userId: 4,
      userEmail: null,
      initiatorEmail: null,
      resourceUsage: null,
      items: [],
    },
  ];
  render(<BillingTransactionsExport {...range} />, { wrapper });
  await screen.findByRole('button', { name: 'Download CSV' });

  expect(state.query).toHaveBeenCalledWith(
    { start: '2026-09-01T00:00:00.000Z', end: '2026-09-02T00:00:00.000Z' },
    undefined,
    { refetchOnWindowFocus: false },
  );
  // existing keys stay stable and in order because templates reference them
  expect(state.fields.slice(0, 11).map((c) => c.key)).toEqual([
    'id',
    'user',
    'createdAt',
    'amount',
    'initiator',
    'resourceUsage',
    'refundOf',
    'correctionOf',
    'externalReference',
    'status',
    'items',
  ]);
  const values = (key: string) => {
    const column = state.fields.find((c) => c.key === key);
    expect(column, key).toBeDefined();
    return state.items.map((row) => column?.getter(row as never));
  };
  expect(values('userId')).toEqual([3, 4]);
  expect(values('userEmail')).toEqual(['alice@example.com', '']);
  expect(values('userExternalIdentifier')).toEqual(['EXT-3', '']);
  expect(values('initiatorEmail')).toEqual(['mentor@example.com', '']);
  expect(values('resourceUsage')).toEqual(['Lathe', '']);
  expect(values('amount')).toEqual([12.5, 12.5]);
  expect(values('items')).toEqual(['2x Wood @ 3', '']);
  expect(values('resourceMetadata.costCenter')).toEqual(['4711', '']);
  expect(values('resourceMetadata.tags')).toEqual(['["a","b"]', '']);
  expect(state.fields.find((c) => c.key === 'resourceMetadata.costCenter')?.label).toBe(
    'Resource metadata: costCenter',
  );
});

it('downloads exactly the default columns without a template', async () => {
  state.rows = [transaction];
  let blob: Blob | undefined;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
    blob = value as Blob;
    return 'blob:csv-test';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  render(<BillingTransactionsExport {...range} />, { wrapper });

  const download = screen.getByRole('button', { name: 'Download CSV' });
  await waitFor(() => expect(download).toBeEnabled());
  fireEvent.click(download);
  await waitFor(() => expect(blob).toBeDefined());
  const [header, row] = ((await blob?.text()) ?? '').split('\n');
  expect(header).toBe('ID;User;Created at;Amount;External reference;Status');
  expect(row).toMatch(/^21;Alice;.+;12\.5;INV-1;completed$/);
});
