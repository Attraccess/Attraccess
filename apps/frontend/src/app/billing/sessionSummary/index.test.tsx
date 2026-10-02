import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BillingTransaction } from '@attraccess/react-query-client';
import { SessionBillingSummary } from './index';

const state = vi.hoisted(() => ({
  update: (_transaction: BillingTransaction) => undefined as void,
  configuration: { currency: 'EUR', minorUnit: 2 } as { currency: string; minorUnit: number } | undefined,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 7 } }) }));
vi.mock('../dashboard/summary/live-updates', () => ({
  useLiveTransactionUpdates: ({ onUpdate }: { onUpdate: typeof state.update }) => {
    state.update = onUpdate;
  },
}));
vi.mock('@attraccess/react-query-client', () => ({
  BillingTransactionStatus: { COMPLETED: 'completed' },
  useBillingServiceGetBillingTransaction: () => ({
    data: { resourceUsage: { resource: { name: 'Laser cutter' } } },
  }),
  useBillingServiceGetBillingConfiguration: () => ({
    data: state.configuration,
    isError: state.isError,
    refetch: state.refetch,
  }),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
  useNumberFormatter: (options: Intl.NumberFormatOptions) => (value: number) =>
    value.toFixed(options.maximumFractionDigits),
}));
afterEach(cleanup);
beforeEach(() => {
  state.configuration = { currency: 'EUR', minorUnit: 2 };
  state.isError = false;
  vi.clearAllMocks();
});

function emit(overrides: Partial<BillingTransaction> = {}) {
  // The SSE listener only needs these receipt fields; relations unrelated to the summary are omitted.
  const receipt = {
    id: 1,
    userId: 7,
    status: 'completed',
    amount: -1234,
    resourceUsageId: 10,
    ...overrides,
  } as BillingTransaction;
  act(() => state.update(receipt));
}

it('shows the finalized charge with the resource and configured minor units', () => {
  state.configuration = { currency: 'KWD', minorUnit: 3 };
  render(<SessionBillingSummary />);
  expect(screen.queryByRole('dialog')).toBeNull();
  emit();
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByText('Laser cutter')).toBeTruthy();
  expect(screen.getByText('1.234 KWD')).toBeTruthy();
});

it('ignores unrelated transactions and uncompleted charges', () => {
  render(<SessionBillingSummary />);
  emit({ userId: 8 });
  emit({ status: 'pending' as BillingTransaction['status'] });
  emit({ resourceUsageId: undefined });
  emit({ refundOfId: 2 });
  emit({ correctionOfId: 2 });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('queues simultaneous session receipts and does not reopen dismissed duplicates', async () => {
  render(<SessionBillingSummary />);
  emit();
  emit();
  emit({ id: 2, amount: -500 });
  fireEvent.click(screen.getByRole('button', { name: 'close' }));
  expect(screen.getByText('5.00 EUR')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'close' }));
  emit();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('shows a loading state and lets the user retry a failed currency lookup', () => {
  state.configuration = undefined;
  const view = render(<SessionBillingSummary />);
  emit();
  expect(screen.getByLabelText('loading')).toBeTruthy();
  expect(screen.queryByText('12.34 EUR')).toBeNull();
  state.isError = true;
  view.rerender(<SessionBillingSummary />);
  expect(screen.getByRole('alert').textContent).toBe('loadError');
  fireEvent.click(screen.getByRole('button', { name: 'retry' }));
  expect(state.refetch).toHaveBeenCalledOnce();
});

it('shows a zero-cost finalized receipt', () => {
  render(<SessionBillingSummary />);
  emit({ amount: 0 });
  expect(screen.getByText('0.00 EUR')).toBeTruthy();
});
