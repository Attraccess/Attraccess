import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { SummaryCard } from './index';
const state = vi.hoisted(() => ({
  configuration: { currency: 'EUR', minorUnit: 2 } as { currency: string; minorUnit: number } | undefined,
  userId: 7 as number | undefined,
  balance: 12345,
  loading: false,
  transactions: [] as {
    id: number;
    amount: number;
    status: string;
    createdAt: string;
    refundOfId?: number;
    resourceUsageId?: number;
    initiatorId?: number;
    externalReference?: string;
  }[],
  balanceQuery: vi.fn(),
  transactionsQuery: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({
    t: (
      key: string,
      params?: { balance?: string; currency?: string; originalId?: number; originalDetails?: string },
    ) =>
      key === 'balance'
        ? `${params?.currency} ${params?.balance}`
        : params?.originalId
          ? `${key} #${params.originalId} ${params.originalDetails}`
          : key,
  }),
  useNumberFormatter: () => (value: number) => value.toFixed(2),
  DateTimeDisplay: ({ date }: { date: string }) => <span>{date}</span>,
}));
vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: state.userId ? { id: state.userId } : undefined }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  BillingTransactionStatus: { PENDING: 'pending', COMPLETED: 'completed', FAILED: 'failed' },
  useBillingServiceGetBillingConfiguration: () => ({ data: state.configuration }),
  useBillingServiceGetBillingBalance: (...args: unknown[]) => {
    state.balanceQuery(...args);
    return { data: { value: state.balance }, isLoading: state.loading };
  },
  useBillingServiceGetBillingTransactions: (...args: unknown[]) => {
    state.transactionsQuery(...args);
    return { data: { data: state.transactions } };
  },
}));
vi.mock('./transactionDetailsModal', () => ({
  TransactionDetailsModal: ({
    transactionId,
    isOpen,
    onClose,
  }: {
    transactionId: number;
    isOpen: boolean;
    onClose: () => void;
  }) => (isOpen ? <button onClick={onClose}>Details #{transactionId}</button> : null),
}));
vi.mock('./transactionDetailsModal/refund', () => ({
  RefundModal: ({ children }: { children: (open: () => void) => ReactNode }) => children(() => undefined),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.clearAllMocks();
  state.configuration = { currency: 'EUR', minorUnit: 2 };
  state.userId = 7;
  state.balance = 12345;
  state.loading = false;
  state.transactions = [];
});
function open(props: Parameters<typeof SummaryCard>[0] = {}) {
  return render(
    <MemoryRouter>
      <SummaryCard {...props} />
    </MemoryRouter>,
  );
}
it('formats balance, renders empty transactions and scopes query requests', () => {
  open({ userId: 9, transactionsPerPage: 20 });
  expect(screen.getByText('EUR 123.45')).toBeTruthy();
  expect(screen.getByText('transactions.table.empty')).toBeTruthy();
  expect(state.balanceQuery).toHaveBeenCalledWith({ userId: 9 }, undefined, { enabled: true });
  expect(state.transactionsQuery).toHaveBeenCalledWith({ userId: 9, page: 1, limit: 20 }, undefined, { enabled: true });
});
it('disables fetching without a user or when the card is disabled', () => {
  state.userId = undefined;
  const view = open();
  expect(state.balanceQuery).toHaveBeenLastCalledWith({ userId: 0 }, undefined, { enabled: false });
  view.unmount();
  open({ userId: 9, isDisabled: true });
  expect(state.transactionsQuery).toHaveBeenLastCalledWith({ userId: 9, page: 1, limit: 5 }, undefined, {
    enabled: false,
  });
});
it('renders configuration and balance loading states', () => {
  state.configuration = undefined;
  const view = open();
  expect(screen.queryByText('title')).toBeNull();
  view.unmount();
  state.configuration = { currency: 'EUR', minorUnit: 2 };
  state.loading = true;
  open();
  expect(screen.queryByText('EUR 123.45')).toBeNull();
  expect(screen.getByText('title')).toBeTruthy();
});
it('labels usage, manual, top-up, missing originals and nested refunds and opens row details', () => {
  const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const base = { amount: -123, status: 'completed', createdAt: '2026-09-01' };
  state.transactions = [
    { ...base, id: 1, resourceUsageId: 5 },
    { ...base, id: 2, initiatorId: 7, amount: 500, status: 'pending' },
    { ...base, id: 3, externalReference: 'sumup_topup_transaction:3', status: 'failed' },
    { ...base, id: 4, refundOfId: 1 },
    { ...base, id: 5, refundOfId: 4 },
    { ...base, id: 6, refundOfId: 999 },
    { ...base, id: 7, status: 'unknown' },
  ];
  open();
  const rows = screen.getAllByRole('row');
  expect(within(rows[1]).getByText('transactions.table.cells.details.resourceUsage')).toBeTruthy();
  expect(within(rows[2]).getByText('transactions.table.cells.details.manual')).toBeTruthy();
  expect(within(rows[2]).getByText('+5.00')).toBeTruthy();
  expect(within(rows[3]).getByText('transactions.table.cells.details.sumup:topup')).toBeTruthy();
  expect(
    within(rows[5]).getByText(
      'transactions.table.cells.details.refund #4 transactions.table.cells.details.refund #1 transactions.table.cells.details.resourceUsage',
    ),
  ).toBeTruthy();
  expect(within(rows[6]).getByText('transactions.table.cells.details.refund #999')).toBeTruthy();
  expect(within(rows[7]).getByText('transactions.table.cells.details.unknown')).toBeTruthy();
  expect(warning).toHaveBeenCalled();
  fireEvent.click(rows[1]);
  expect(screen.getByRole('button', { name: 'Details #1' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Details #1' }));
  expect(screen.queryByRole('button', { name: 'Details #1' })).toBeNull();
});
