import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Card,
  CardBody,
  CardHeader,
  CardProps,
  cn,
  Pagination,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';
import de from './de.json';
import en from './en.json';
import { useAuth } from '../../../../hooks/useAuth';
import {
  BillingTransaction,
  useBillingServiceGetBillingBalance,
  useBillingServiceGetBillingTransactions,
} from '@attraccess/react-query-client';
import { CreditCardIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

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

  const { data: balance, isLoading: isLoadingBalance } = useBillingServiceGetBillingBalance(
    { userId: userId ?? 0 },
    undefined,
    {
      enabled: !!userId && !isDisabled,
    },
  );

  const [transactionsPage, setTransactionsPage] = useState(1);

  const {
    data: transactions,
    isLoading: isLoadingTransactions,
    isFetched: isFetchedTransactions,
  } = useBillingServiceGetBillingTransactions(
    { userId: userId ?? 0, page: transactionsPage, limit: transactionsPerPage },
    undefined,
    {
      enabled: !!userId && !isDisabled,
    },
  );

  const getDetailsCellContent = useCallback(
    (transaction: BillingTransaction): string => {
      let type = '';
      let details = {};

      if (transaction.refundOfId) {
        const originalTransaction = transactions?.data?.find((t) => t.id === transaction.refundOfId);
        let originalDetails = {};
        if (originalTransaction) {
          originalDetails = getDetailsCellContent(originalTransaction);
        }
        type = 'refund';
        details = { originalDetails, originalId: originalTransaction?.id };
      } else if (transaction.resourceUsageId) {
        type = 'resourceUsage';
        details = { resourceUsage: transaction.resourceUsage };
      } else if (transaction.initiatorId) {
        type = 'manual';
        details = { initiator: transaction.initiator };
      } else {
        console.error('Unknown transaction type', transaction);
        type = 'unknown';
        details = { transaction };
      }

      return t('transactions.table.cells.details.' + type, details) as string;
    },
    [t, transactions],
  );

  const totalAmountOfTransactionsPages = useMemo(() => {
    return Math.ceil((transactions?.total ?? 0) / transactionsPerPage);
  }, [transactions?.total, transactionsPerPage]);

  return (
    <Card {...cardProps}>
      <CardHeader>
        <PageHeader title={t('title')} noMargin icon={<CreditCardIcon />} />
      </CardHeader>
      <CardBody>
        <div className="mb-4">
          {isLoadingBalance ? (
            <Spinner />
          ) : (
            <p className="text-2xl font-bold">{t('balance', { balance: balance?.value })}</p>
          )}
        </div>

        <Table
          removeWrapper
          bottomContent={
            isFetchedTransactions && (
              <Pagination
                isCompact
                showControls
                page={transactionsPage}
                total={totalAmountOfTransactionsPages}
                onChange={(page) => setTransactionsPage(page)}
              />
            )
          }
        >
          <TableHeader>
            <TableColumn>{t('transactions.table.columns.id')}</TableColumn>
            <TableColumn>{t('transactions.table.columns.dateTime')}</TableColumn>
            <TableColumn>{t('transactions.table.columns.details')}</TableColumn>
            <TableColumn align="end">{t('transactions.table.columns.amount')}</TableColumn>
          </TableHeader>
          <TableBody items={transactions?.data ?? []} isLoading={isLoadingTransactions}>
            {(transaction) => (
              <TableRow key={transaction.id}>
                <TableCell>{transaction.id}</TableCell>
                <TableCell>
                  <DateTimeDisplay date={transaction.createdAt} />
                </TableCell>
                <TableCell>{getDetailsCellContent(transaction)}</TableCell>
                <TableCell className={cn(transaction.amount < 0 ? 'text-danger' : 'text-success')}>
                  {transaction.amount > 0 && '+'}
                  {transaction.amount}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}
