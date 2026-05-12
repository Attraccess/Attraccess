import { DateTimeDisplay, useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardProps,
  Chip,
  cn,
  Skeleton,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';
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
import { CreditCardIcon, ReceiptTextIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { TransactionDetailsModal } from './transactionDetailsModal';

interface Props {
  transactionsPerPage?: number;
  userId?: number;
  isDisabled?: boolean;
}

export function SummaryCard(props: Omit<CardProps, 'children'> & Props) {
  const { transactionsPerPage = 5, userId: userIdFromProps, isDisabled, ...cardProps } = props;
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

  const {
    data: transactions,
  } = useBillingServiceGetBillingTransactions(
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

  const formatNumber = useNumberFormatter();

  const [openedTransactionId, setOpenedTransactionId] = useState<number | undefined>(undefined);
  const [isOpenDetails, setIsOpenDetails] = useState(false);

  if (!configuration) {
    return <Skeleton className="h-10 w-full" />;
  }

  return (
    <Card {...cardProps}>
      <CardHeader>
        <PageHeader title={t('title')} noMargin icon={<CreditCardIcon />} />
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          {isLoadingBalance ? (
            <Spinner />
          ) : (
            <p className="text-2xl font-bold">
              {t('balance', {
                balance: formatNumber(dbCurrencyToUserCurrency(balance?.value ?? 0, configuration.minorUnit)),
                currency: configuration.currency,
              })}
            </p>
          )}
        </div>

        <Table>
          <TableContent aria-label={t('transactions.table.ariaLabel')}>
          <TableHeader>
            <TableColumn>{t('transactions.table.columns.id')}</TableColumn>
            <TableColumn>{t('transactions.table.columns.dateTime')}</TableColumn>
            <TableColumn>{t('transactions.table.columns.status')}</TableColumn>
            <TableColumn className="w-full">
              {t('transactions.table.columns.details')}
            </TableColumn>
            <TableColumn>{t('transactions.table.columns.amount')}</TableColumn>
            <TableColumn>{t('transactions.table.columns.actions')}</TableColumn>
          </TableHeader>
          <TableBody items={transactions?.data ?? []}>
            {(transaction) => (
              <TableRow key={transaction.id} id={transaction.id} className="wrap-none cursor-pointer">
                <TableCell>{transaction.id}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <DateTimeDisplay date={transaction.createdAt} />
                </TableCell>
                <TableCell>
                  <Chip color={statusColor(transaction.status)}>
                    {t('transactions.table.cells.status.' + transaction.status)}
                  </Chip>
                </TableCell>
                <TableCell className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {getDetailsCellContent(transaction)}
                </TableCell>
                <TableCell className={cn(transaction.amount < 0 ? 'text-danger' : 'text-success')}>
                  {transaction.amount > 0 && '+'}
                  {formatNumber(dbCurrencyToUserCurrency(transaction.amount, configuration.minorUnit))}
                </TableCell>
                <TableCell>
                  <Button isIconOnly variant="ghost" onPress={() => { setOpenedTransactionId(transaction.id); setIsOpenDetails(true); }}>
                    <ReceiptTextIcon />
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          </TableContent>
        </Table>

        {openedTransactionId && (
          <TransactionDetailsModal
            transactionId={openedTransactionId}
            isOpen={isOpenDetails}
            onClose={() => setIsOpenDetails(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}
