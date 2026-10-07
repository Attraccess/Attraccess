import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCreditsFormatter } from '../../../../hooks/useCreditsFormatter';
import de from './de.json';
import en from './en.json';
import { useAuth } from '../../../../hooks/useAuth';
import {
  BillingTransaction,
  BillingTransactionStatus,
  useBillingServiceGetBillingBalance,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetBillingTransactions,
} from '@attraccess/react-query-client';
import { useCallback, useMemo, useState } from 'react';
import { Props } from './index.props';
export function useSummaryCardState(props: Props) {
  const { className, transactionsPerPage = 5, userId: userIdFromProps, isDisabled } = props;
  const { t } = useTranslations({ en, de });

  const { user: currentUser } = useAuth();

  const userId = useMemo(() => userIdFromProps ?? currentUser?.id, [userIdFromProps, currentUser]);

  const { data: configuration } = useBillingServiceGetBillingConfiguration();
  const { data: balance, isLoading: isLoadingBalance } = useBillingServiceGetBillingBalance(
    { userId: userId ?? 0 },
    undefined,
    {
      enabled: !!userId && !isDisabled,
    },
  );

  const [transactionsPage] = useState(1);

  const { data: transactions } = useBillingServiceGetBillingTransactions(
    { userId: userId ?? 0, page: transactionsPage, limit: transactionsPerPage },
    undefined,
    {
      enabled: !!userId && !isDisabled,
    },
  );

  const getDetailsCellContent = useCallback(
    (transaction: BillingTransaction, skipNested = false): string => {
      let type = '';
      let details = {} as Record<string, unknown>;

      if (transaction.refundOfId) {
        const originalTransaction = transactions?.data?.find((t) => t.id === transaction.refundOfId);
        let originalDetails = '';

        if (originalTransaction) {
          if (!skipNested) {
            // One level of nesting: get a proper string for the original
            originalDetails = getDetailsCellContent(originalTransaction, true);
          } else {
            // Skip deeper recursion but still provide a human-friendly label
            if (originalTransaction.resourceUsageId) {
              type = 'resourceUsage';
              const tmp = t('transactions.table.cells.details.resourceUsage', {
                resourceUsage: originalTransaction.resourceUsage,
              }) as string;
              originalDetails = tmp;
              type = '';
            } else if (originalTransaction.initiatorId) {
              const tmp = t('transactions.table.cells.details.manual', {
                initiator: originalTransaction.initiator,
              }) as string;
              originalDetails = tmp;
            } else if (originalTransaction.externalReference?.startsWith('sumup_topup_transaction')) {
              originalDetails = t('transactions.table.cells.details.sumup:topup') as string;
            } else if (originalTransaction.refundOfId) {
              // Show a compact refund label without further nesting
              originalDetails = t('transactions.table.cells.details.refund', {
                originalDetails: '',
                originalId: originalTransaction.refundOfId,
              }) as string;
            } else {
              originalDetails = t('transactions.table.cells.details.unknown') as string;
            }
          }
        }

        type = 'refund';
        details = {
          originalDetails,
          // Fallback to the known id even if the original transaction object isn't loaded
          originalId: originalTransaction?.id ?? transaction.refundOfId,
        };
      } else if (transaction.correctionOfId) {
        type = 'correction';
        details = { originalId: transaction.correctionOfId };
      } else if (transaction.resourceUsageId) {
        type = 'resourceUsage';
        details = { resourceUsage: transaction.resourceUsage };
      } else if (transaction.initiatorId) {
        type = 'manual';
        details = { initiator: transaction.initiator };
      } else if (transaction.externalReference?.startsWith('sumup_topup_transaction')) {
        type = 'sumup:topup';
      } else {
        console.error('Unknown transaction type', transaction);
        type = 'unknown';
        details = { transaction };
      }

      return t('transactions.table.cells.details.' + type, details) as string;
    },
    [t, transactions],
  );

  const statusColor = useCallback((status: BillingTransaction['status']) => {
    switch (status) {
      case BillingTransactionStatus.PENDING:
        return 'warning';
      case BillingTransactionStatus.COMPLETED:
        return 'success';
      case BillingTransactionStatus.FAILED:
        return 'danger';
      default:
        return 'default';
    }
  }, []);

  const formatCredits = useCreditsFormatter(configuration?.minorUnit ?? 2);

  const [openedTransactionId, setOpenedTransactionId] = useState<number | undefined>(undefined);
  const [isOpenDetails, setIsOpenDetails] = useState(false);

  const openDetails = useCallback((transactionId: number) => {
    setOpenedTransactionId(transactionId);
    setIsOpenDetails(true);
  }, []);
  return {
    className,
    t,
    configuration,
    balance,
    isLoadingBalance,
    transactions,
    getDetailsCellContent,
    statusColor,
    formatCredits,
    openedTransactionId,
    isOpenDetails,
    setIsOpenDetails,
    openDetails,
  };
}
