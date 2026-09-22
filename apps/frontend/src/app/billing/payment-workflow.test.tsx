import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResourceBillingInfoEditor } from '../resources/details/resourceBillingInfo/editor';
import { ApiKeyCard } from './administration/sumup/configuration/apiKey';
import { RefundModal } from './dashboard/summary/transactionDetailsModal/refund';
import { TransactionProcessingCard } from './dashboard/topup/transactionProcessingStatus';
const state = vi.hoisted(() => ({
  enabled: true,
  loading: false,
  permitted: true,
  transaction: { id: 7, userId: 3, amount: -1234 },
  configuration: { minorUnit: 2, currency: 'EUR' } as { minorUnit: number; currency: string } | undefined,
  mutateKey: vi.fn(),
  refund: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  apiError: vi.fn(),
  live: undefined as ((transaction: { id: number; status: string }) => void) | undefined,
  callbacks: {} as Record<string, { onSuccess: () => void; onError: (error: Error) => void }>,
}));
vi.mock('@attraccess/react-query-client', () => ({
  BillingTransactionStatus: { PENDING: 'pending', COMPLETED: 'completed', FAILED: 'failed' },
  useBillingServiceGetSumUpConfiguration: () => ({ data: { enabled: state.enabled }, isLoading: state.loading }),
  useBillingServiceGetSumUpConfigurationKey: 'sumup-config',
  useBillingServiceGetSumUpReadersKey: 'readers',
  useBillingServiceSetSumUpApiKey: (callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.key = callbacks;
    return { mutate: state.mutateKey };
  },
  useBillingServiceGetBillingTransaction: () => ({ data: state.transaction }),
  useBillingServiceGetBillingConfiguration: () => ({ data: state.configuration }),
  useBillingServiceRefundTransaction: (callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.refund = callbacks;
    return { mutate: state.refund };
  },
  useBillingServiceGetBillingTransactionsKey: 'transactions',
  UseBillingServiceGetBillingTransactionKeyFn: (input: unknown) => ['transaction', input],
  UseBillingServiceGetBillingBalanceKeyFn: (input: unknown) => ['balance', input],
  useBillingServiceGetBillingTransactions: () => ({ data: undefined }),
  useBillingServiceGetResourceBillingConfiguration: () => ({ data: undefined }),
  UseBillingServiceGetResourceBillingConfigurationKeyFn: (input: unknown) => ['resource-billing', input],
  useBillingServiceUpdateResourceBillingConfiguration: (callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.resource = callbacks;
    return { mutate: state.refund };
  },
}));
vi.mock('./dashboard/summary/live-updates', () => ({
  useLiveTransactionUpdates: ({ onUpdate }: { onUpdate: typeof state.live }) => {
    state.live = onUpdate;
  },
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 3 }, hasPermission: () => state.permitted }) }));
vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.apiError }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
beforeEach(() => {
  vi.clearAllMocks();
  state.enabled = true;
  state.loading = false;
  state.permitted = true;
  state.configuration = { minorUnit: 2, currency: 'EUR' };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('validates and saves SumUp credentials, refreshing readers and exposing API errors', () => {
  render(
    <MemoryRouter>
      <ApiKeyCard />
    </MemoryRouter>,
  );
  expect(screen.getByText('Enabled')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(state.mutateKey).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/API Key/), { target: { value: 'sumup-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(state.mutateKey).toHaveBeenCalledWith({ requestBody: { apiKey: 'sumup-secret' } });
  act(() => state.callbacks.key.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['sumup-config'] });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['readers'] });
  expect(state.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Credentials updated' }));
  const error = new Error('Rejected');
  act(() => state.callbacks.key.onError(error));
  expect(state.apiError).toHaveBeenCalledWith(expect.objectContaining({ error }));
});
it.each([true, false])('renders credential configuration loading state (%s)', (loading) => {
  state.loading = loading;
  state.enabled = false;
  render(
    <MemoryRouter>
      <ApiKeyCard />
    </MemoryRouter>,
  );
  expect(screen.getByText(loading ? 'Loading...' : 'Disabled')).toBeInTheDocument();
});
it('submits a partial refund in minor units and refreshes the transaction and user balance', async () => {
  render(<RefundModal transactionId={7}>{(open) => <button onClick={open}>Open refund</button>}</RefundModal>);
  fireEvent.click(screen.getByText('Open refund'));
  const amount = screen.getByRole('textbox', { name: 'Amount' });
  expect(amount).toHaveValue('12.34');
  fireEvent.change(amount, { target: { value: '5.25' } });
  fireEvent.blur(amount);
  fireEvent.click(screen.getByRole('button', { name: 'Refund' }));
  expect(state.refund).toHaveBeenCalledWith({ transactionId: 7, requestBody: { amount: 525 } });
  const error = new Error('Refund rejected');
  act(() => state.callbacks.refund.onError(error));
  expect(state.apiError).toHaveBeenCalledWith(expect.objectContaining({ error }));
  act(() => state.callbacks.refund.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['transactions'] });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['transaction', { transactionId: 7 }] });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['balance', { userId: 3 }] });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('hides refunds without permission or billing configuration', () => {
  state.permitted = false;
  const view = render(<RefundModal transactionId={7}>{(open) => <button onClick={open}>Refund</button>}</RefundModal>);
  expect(screen.queryByRole('button')).toBeNull();
  view.unmount();
  state.permitted = true;
  state.configuration = undefined;
  render(<RefundModal transactionId={7}>{(open) => <button onClick={open}>Refund</button>}</RefundModal>);
  expect(screen.queryByRole('button')).toBeNull();
});
it.each(['completed', 'failed'])(
  'waits for the matching transaction to be %s before notifying completion',
  (status) => {
    vi.useFakeTimers();
    const complete = vi.fn();
    render(
      <MemoryRouter>
        <TransactionProcessingCard transactionId={7} onProcessingComplete={complete} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    act(() => {
      state.live?.({ id: 8, status });
      vi.advanceTimersByTime(1000);
    });
    expect(complete).not.toHaveBeenCalled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    act(() => state.live?.({ id: 7, status }));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(complete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(complete).toHaveBeenCalledOnce();
  },
);

it('edits all three resource rates and converts them to minor units', async () => {
  render(
    <ResourceBillingInfoEditor resourceId={9}>
      {(open) => <button onClick={open}>Edit rates</button>}
    </ResourceBillingInfoEditor>,
  );
  fireEvent.click(screen.getByText('Edit rates'));
  for (const [name, value] of [
    ['EUR per usage', '1.25'],
    ['EUR per minute', '2.5'],
    ['EUR per operating minute', '3.75'],
  ]) {
    const input = screen.getByRole('textbox', { name });
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(state.refund).toHaveBeenCalledWith({
    resourceId: 9,
    requestBody: { creditsPerUsage: 125, creditsPerMinute: 250, creditsPerOperatingMinute: 375 },
  });
  const error = new Error('Rate rejected');
  act(() => state.callbacks.resource.onError(error));
  expect(state.apiError).toHaveBeenCalledWith(expect.objectContaining({ error }));
  act(() => state.callbacks.resource.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['resource-billing', { resourceId: 9 }] });
  expect(state.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Billing updated' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
