import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingTransaction } from '@attraccess/react-query-client';
import { SessionBillingSummary } from './index';

const state = vi.hoisted(() => ({
  update: (_transaction: BillingTransaction) => undefined as void,
  configuration: { currency: 'EUR', minorUnit: 2 } as { currency: string; minorUnit: number } | undefined,
  isError: false,
  refetch: vi.fn(),
  details: undefined as { resourceUsage: { resource: { name: string } } } | undefined,
  detailsEnabled: false,
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 7 } }) }));
vi.mock('../dashboard/summary/live-updates', () => ({
  useLiveTransactionUpdates: ({ onUpdate }: { onUpdate: typeof state.update }) => {
    state.update = onUpdate;
  },
}));
vi.mock('@attraccess/react-query-client', () => ({
  BillingTransactionStatus: { COMPLETED: 'completed' },
  useGetBillingTransaction: (_path: unknown, _key: unknown, options: { enabled: boolean }) => {
    state.detailsEnabled = options.enabled;
    return { data: state.details };
  },
  useGetBillingConfiguration: () => ({
    data: state.configuration,
    isError: state.isError,
    refetch: state.refetch,
  }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key }),
    useNumberFormatter: (options: Intl.NumberFormatOptions) => (value: number) =>
      value.toFixed(options.maximumFractionDigits),
  }))()),
}));
afterEach(cleanup);
beforeEach(() => {
  state.configuration = { currency: 'EUR', minorUnit: 2 };
  state.isError = false;
  state.details = { resourceUsage: { resource: { name: 'Laser cutter' } } };
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
  expect(screen.queryByText('0.00 EUR')).toBeNull();
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

it('does not show a zero-cost finalized receipt', () => {
  render(<SessionBillingSummary />);
  emit({ amount: 0 });
  expect(screen.queryByRole('dialog')).toBeNull();
});

describe('a session whose project was switched', () => {
  const switched = (continues: boolean, sessionAmount: number) => ({
    switchedSession: { continues, sessionAmount, resourceName: 'CNC mill' },
  });

  it('calls the charge at a switch the charge of the ended part, not the total of the session', () => {
    render(<SessionBillingSummary />);
    emit({ amount: -1100, ...switched(true, -1100) });

    expect(screen.getByText('part.title')).toBeTruthy();
    expect(screen.getByText('part.total')).toBeTruthy();
    expect(screen.getByText('part.continues')).toBeTruthy();
    expect(screen.getByText('11.00 EUR')).toBeTruthy();
    expect(screen.queryByText('title')).toBeNull();
    expect(screen.queryByText('total')).toBeNull();
  });

  it('opens nothing for an ended part without a charge', () => {
    render(<SessionBillingSummary />);
    emit({ amount: 0, ...switched(true, -1100) });
    // The removal of its pending bill.
    emit({ id: 2, amount: 0, status: 'pending' as BillingTransaction['status'], ...switched(true, -1100) });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows what the whole session cost when it ends', () => {
    render(<SessionBillingSummary />);
    emit({ amount: -300, ...switched(false, -2200) });

    expect(screen.getByText('title')).toBeTruthy();
    expect(screen.getByText('total')).toBeTruthy();
    expect(screen.getByText('allParts')).toBeTruthy();
    expect(screen.getByText('22.00 EUR')).toBeTruthy();
    expect(screen.queryByText('3.00 EUR')).toBeNull();
  });

  it.each([
    ['a removed pending bill', 'pending', 'CNC mill'],
    ['a completed bill of 0', 'completed', 'CNC mill'],
  ])('shows the total although the last part is free (%s)', (_name, status, resourceName) => {
    state.details = undefined;
    render(<SessionBillingSummary />);
    emit({ amount: 0, status: status as BillingTransaction['status'], ...switched(false, -1200) });

    expect(screen.getByText('12.00 EUR')).toBeTruthy();
    expect(screen.getByText(resourceName)).toBeTruthy();
    // A removed bill cannot be read any more.
    expect(state.detailsEnabled).toBe(status === 'completed');
  });

  it('opens nothing when no part of the session was charged', () => {
    render(<SessionBillingSummary />);
    emit({ amount: 0, status: 'pending' as BillingTransaction['status'], ...switched(false, 0) });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('leaves a session that was never switched as it was', () => {
    render(<SessionBillingSummary />);
    emit();

    expect(screen.getByText('title')).toBeTruthy();
    expect(screen.getByText('total')).toBeTruthy();
    expect(screen.queryByText('allParts')).toBeNull();
    expect(screen.queryByText('part.continues')).toBeNull();
  });
});
