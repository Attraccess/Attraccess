import { useQueryClient } from '@tanstack/react-query';
import { useGetBillingBalanceKey, useGetBillingTransactionsKey } from '@attraccess/react-query-client';
import { useLiveTransactionUpdates } from './live-updates';

/**
 * Loads the transactions and balance of `userId` again when one of its transactions changes or goes away, such as the
 * pending bill of a session that ended without any charge. Used by `SummaryCard`.
 */
export function useReloadOnTransactionUpdates(userId: number | undefined, enabled: boolean) {
  const queryClient = useQueryClient();

  useLiveTransactionUpdates({
    enabled: enabled && userId !== undefined,
    onUpdate: (transaction) => {
      if (transaction.userId !== userId) return;
      void queryClient.invalidateQueries({ queryKey: [useGetBillingTransactionsKey] });
      void queryClient.invalidateQueries({ queryKey: [useGetBillingBalanceKey] });
    },
  });
}
