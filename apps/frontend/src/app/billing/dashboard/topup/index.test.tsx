import { Providers } from '@attraccess/ui';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BillingDashboardTopupCard } from './index';
const state = vi.hoisted(() => ({
  enabled: true,
  loading: false,
  error: false,
  balance: 0,
  readers: [{ id: 'reader-1', name: 'Front desk' }],
  configuration: { currency: 'EUR', minorUnit: 2 } as { currency: string; minorUnit: number } | undefined,
  mutate: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
  callbacks: {} as { onSuccess: (transaction: { id: number }) => void; onError: (error: Error) => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => false }),
  useNumberFormatter: () => String,
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 7 } }) }));
vi.mock('../../../../components/toastProvider', () => ({ useToastMessage: () => ({ apiError: state.toast }) }));
vi.mock('./transactionProcessingStatus', () => ({
  TransactionProcessingCard: ({
    transactionId,
    onProcessingComplete,
  }: {
    transactionId: number;
    onProcessingComplete: () => void;
  }) => <button onClick={onProcessingComplete}>Complete transaction {transactionId}</button>,
}));
vi.mock('@attraccess/react-query-client', () => ({
  useBillingServiceGetBillingConfiguration: () => ({ data: state.configuration }),
  useBillingServiceGetSumUpConfiguration: () => ({
    data: { enabled: state.enabled },
    isLoading: state.loading,
    isError: state.error,
  }),
  useBillingServiceGetSumUpReaders: () => ({ data: state.readers }),
  useBillingServiceGetBillingBalance: () => ({ data: { value: state.balance } }),
  useBillingServiceGetBillingTransactionsKey: 'transactions',
  useBillingServiceTopUpWithSumUpReader: (callbacks: typeof state.callbacks) => {
    state.callbacks = callbacks;
    return { mutate: state.mutate, isPending: false };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.enabled = true;
  state.loading = false;
  state.error = false;
  state.balance = 0;
  state.readers = [{ id: 'reader-1', name: 'Front desk' }];
  state.configuration = { currency: 'EUR', minorUnit: 2 };
});
afterEach(cleanup);
it('tops up the desired amount plus existing debt in currency minor units', () => {
  state.balance = -250;
  const complete = vi.fn();
  render(<BillingDashboardTopupCard desiredAmount={10} onProcessingComplete={complete} />);
  fireEvent.click(screen.getByRole('button', { name: 'actions.topUp' }));
  expect(state.mutate).toHaveBeenCalledWith({ requestBody: { amount: 1300, readerId: 'reader-1' } });
  act(() => state.callbacks.onSuccess({ id: 19 }));
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['transactions'] });
  fireEvent.click(screen.getByRole('button', { name: 'Complete transaction 19' }));
  expect(complete).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'actions.topUp' })).toBeTruthy();
});
it('uses the default amount and reports mutation errors without starting transaction tracking', () => {
  render(<BillingDashboardTopupCard />);
  fireEvent.click(screen.getByRole('button', { name: 'actions.topUp' }));
  expect(state.mutate).toHaveBeenCalledWith({ requestBody: { amount: 1000, readerId: 'reader-1' } });
  const error = new Error('Reader offline');
  act(() => state.callbacks.onError(error));
  expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ error, baseTranslationKey: 'error.toast' }));
  expect(screen.queryByText(/Complete transaction/)).toBeNull();
});
it('does not submit without a reader or currency configuration', () => {
  state.readers = [];
  const view = render(<BillingDashboardTopupCard />);
  expect((screen.getByRole('button', { name: 'actions.topUp' }) as HTMLButtonElement).disabled).toBe(true);
  state.readers = [{ id: 'reader-1', name: 'Front desk' }];
  state.configuration = undefined;
  view.rerender(<BillingDashboardTopupCard />);
  fireEvent.click(screen.getByRole('button', { name: 'actions.topUp' }));
  expect(state.mutate).not.toHaveBeenCalled();
});
it('shows unavailable and loading states without payment controls', () => {
  state.loading = true;
  const view = render(<BillingDashboardTopupCard title="Top up" />);
  expect(screen.queryByRole('button', { name: 'actions.topUp' })).toBeNull();
  state.loading = false;
  state.enabled = false;
  view.rerender(<BillingDashboardTopupCard />);
  expect(screen.getByText('unavailable.title')).toBeTruthy();
  state.enabled = true;
  state.error = true;
  view.rerender(<BillingDashboardTopupCard />);
  expect(screen.getByText('unavailable.description')).toBeTruthy();
  expect(state.mutate).not.toHaveBeenCalled();
});

function render(ui: ReactElement) {
  return renderUI(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <Providers>{children}</Providers>
      </MemoryRouter>
    ),
  });
}
