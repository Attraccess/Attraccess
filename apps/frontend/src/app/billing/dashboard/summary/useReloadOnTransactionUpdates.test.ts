import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useReloadOnTransactionUpdates } from './useReloadOnTransactionUpdates';

const state = vi.hoisted(() => ({
  invalidate: vi.fn(),
  subscription: undefined as
    { enabled?: boolean; onUpdate: (transaction: { id: number; userId: number }) => void } | undefined,
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useGetBillingBalanceKey: 'GetBillingBalance',
  useGetBillingTransactionsKey: 'GetBillingTransactions',
}));
vi.mock('./live-updates', () => ({
  useLiveTransactionUpdates: (props: typeof state.subscription) => {
    state.subscription = props;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.subscription = undefined;
});

it('loads the transactions and balance again when a transaction of the shown user changes or goes away', () => {
  renderHook(() => useReloadOnTransactionUpdates(7, true));

  expect(state.subscription?.enabled).toBe(true);
  state.subscription?.onUpdate({ id: 16, userId: 7 });

  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['GetBillingTransactions'] });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['GetBillingBalance'] });
});

it('ignores updates of another user', () => {
  renderHook(() => useReloadOnTransactionUpdates(9, true));

  state.subscription?.onUpdate({ id: 16, userId: 7 });

  expect(state.invalidate).not.toHaveBeenCalled();
});

it('does not subscribe while disabled or without a user', () => {
  renderHook(() => useReloadOnTransactionUpdates(7, false));
  expect(state.subscription?.enabled).toBe(false);

  renderHook(() => useReloadOnTransactionUpdates(undefined, true));
  expect(state.subscription?.enabled).toBe(false);
});
