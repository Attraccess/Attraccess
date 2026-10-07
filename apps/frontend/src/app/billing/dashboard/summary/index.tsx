import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import {
  Button,
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
  TableScrollContainer,
} from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';
import { EmptyState } from '../../../../components/emptyState';
import { CreditCardIcon, RotateCcwIcon } from 'lucide-react';
import { TransactionDetailsModal } from './transactionDetailsModal';
import { RefundModal } from './transactionDetailsModal/refund';
import { Props } from './index.props';
import { useSummaryCardState } from './useSummaryCardState';

export function SummaryCard(props: Props) {
  const {
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
  } = useSummaryCardState(props);

  if (!configuration) {
    return <Skeleton className="h-10 w-full" />;
  }

  return (
    <div className={cn('w-full flex flex-col gap-6', className)}>
      <PageHeader title={t('title')} noMargin icon={<CreditCardIcon />} />

      {isLoadingBalance ? (
        <Spinner />
      ) : (
        <p className="text-2xl font-bold">
          {t('balance', {
            balance: formatCredits(balance?.value ?? 0),
            currency: configuration.currency,
          })}
        </p>
      )}

      <Table>
        <TableScrollContainer>
          <TableContent aria-label={t('transactions.table.ariaLabel')} onRowAction={(key) => openDetails(Number(key))}>
            <TableHeader>
              <TableColumn isRowHeader>{t('transactions.table.columns.id')}</TableColumn>
              <TableColumn>{t('transactions.table.columns.dateTime')}</TableColumn>
              <TableColumn>{t('transactions.table.columns.status')}</TableColumn>
              <TableColumn className="w-full">{t('transactions.table.columns.details')}</TableColumn>
              <TableColumn>{t('transactions.table.columns.amount')}</TableColumn>
              <TableColumn>{t('transactions.table.columns.actions')}</TableColumn>
            </TableHeader>
            <TableBody
              items={transactions?.data ?? []}
              renderEmptyState={() => <EmptyState message={t('transactions.table.empty') as string} />}
            >
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
                    {formatCredits(transaction.amount)}
                  </TableCell>
                  <TableCell>
                    <RefundModal transactionId={transaction.id}>
                      {(onOpen) => (
                        <Button
                          isIconOnly
                          variant="danger-soft"
                          aria-label={t('transactions.table.actions.refund') as string}
                          onPress={onOpen}
                        >
                          <RotateCcwIcon />
                        </Button>
                      )}
                    </RefundModal>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>

      {openedTransactionId && (
        <TransactionDetailsModal
          transactionId={openedTransactionId}
          isOpen={isOpenDetails}
          onClose={() => setIsOpenDetails(false)}
        />
      )}
    </div>
  );
}
