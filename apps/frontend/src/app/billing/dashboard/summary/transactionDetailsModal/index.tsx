import { useMeterValueFormatter } from '../../../../../hooks/useMeterValueFormatter';
import { useCreditsFormatter } from '../../../../../hooks/useCreditsFormatter';
import {
  Button,
  Chip,
  Separator,
  ModalBody,
  ModalHeader,
  ModalHeading,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableScrollContainer,
  TableRow,
  useOverlayState,
} from '@heroui/react';
import de from './de.json';
import en from './en.json';
import { AttraccessUser, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  BillingTransaction,
  BillingTransactionStatus,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetBillingTransaction,
} from '@attraccess/react-query-client';
import { DateTimeDisplay, useNumberFormatter } from '@attraccess/plugins-frontend-ui';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { useEffect, useMemo, useState } from 'react';
import { StandardModal } from '../../../../../components/standardModal';
import { RefundModal } from './refund';
import { UsageNotesModal } from '../../../../resources/usage/components/UsageNotesModal';

export interface TransactionDetailsModalProps {
  children?: (onOpen: () => void) => React.ReactNode;
  transactionId: number;
  isOpen?: boolean;
  onClose?: () => unknown;
}

export function TransactionDetailsModal(props: TransactionDetailsModalProps) {
  const { children, transactionId, isOpen: isOpenProp, onClose: onCloseProp } = props;

  const { t, tExists } = useTranslations({ en, de });

  const { open, isOpen, setOpen, close } = useOverlayState({
    onOpenChange: (o) => {
      if (!o) onCloseProp?.();
    },
  });

  useEffect(() => {
    if (isOpenProp === undefined) {
      return;
    }

    if (isOpenProp) {
      open();
    } else {
      close();
    }
  }, [isOpenProp, open, close]);

  const {
    data: transaction,
    error,
    refetch,
  } = useBillingServiceGetBillingTransaction({ transactionId }, undefined, { enabled: isOpen });
  const { data: configuration } = useBillingServiceGetBillingConfiguration(undefined, { enabled: isOpen });

  const [isUsageOpen, setUsageOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) setUsageOpen(false);
  }, [isOpen]);

  const formatNumber = useNumberFormatter();
  const formatMeterValue = useMeterValueFormatter();
  const formatCredits = useCreditsFormatter(configuration?.minorUnit ?? 2);

  const statusColor = (status: BillingTransaction['status']) => {
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
  };

  const totalItemsAmount = useMemo(() => {
    if (!transaction?.items) return 0;
    const items = Array.isArray(transaction.items) ? transaction.items : [transaction.items];
    return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }, [transaction]);

  return (
    <>
      {children && children(open)}
      <StandardModal isOpen={isOpen} onOpenChange={setOpen} size="lg" dialogProps={{ className: 'max-w-4xl' }}>
        {() => (
          <>
            <ModalHeader>
              <div className="flex w-full items-center justify-between gap-2">
                <ModalHeading>{t('title')}</ModalHeading>
                <RefundModal transactionId={transactionId}>
                  {(onOpen) => (
                    <Button variant="danger-soft" onPress={onOpen}>
                      {t('actions.refund')}
                    </Button>
                  )}
                </RefundModal>
              </div>
            </ModalHeader>
            <ModalBody>
              {error ? (
                <div role="alert">
                  <p>{t('loadError')}</p>
                  <Button variant="secondary" onPress={() => refetch()}>
                    {t('retry')}
                  </Button>
                </div>
              ) : !transaction ? (
                <div className="py-6 text-center text-default-500">{t('loading')}</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-small text-default-500">{t('meta.id')}</div>
                      <div className="font-medium">#{transaction.id}</div>
                    </div>
                    <div>
                      <div className="text-small text-default-500">{t('meta.date')}</div>
                      <div className="font-medium">
                        <DateTimeDisplay date={transaction.createdAt} />
                      </div>
                    </div>
                    <div>
                      <div className="text-small text-default-500">{t('meta.type')}</div>
                      <div className="font-medium">
                        {transaction.refundOfId
                          ? t('type.refund')
                          : transaction.correctionOfId
                            ? t('type.correction')
                            : transaction.resourceUsageId
                              ? t('type.resourceUsage')
                              : transaction.initiatorId
                                ? t('type.manual')
                                : transaction.externalReference?.startsWith('sumup_topup_transaction')
                                  ? t('type.sumupTopup')
                                  : t('type.unknown')}
                      </div>
                    </div>
                    <div>
                      <div className="text-small text-default-500">{t('meta.status')}</div>
                      <Chip color={statusColor(transaction.status)} variant="soft">
                        {t('status.' + transaction.status)}
                      </Chip>
                    </div>
                    <div>
                      <div className="text-small text-default-500">{t('meta.amount')}</div>
                      <div
                        className={transaction.amount < 0 ? 'text-danger font-semibold' : 'text-success font-semibold'}
                      >
                        {transaction.amount > 0 && '+'}
                        {formatNumber(dbCurrencyToUserCurrency(transaction.amount, configuration?.minorUnit ?? 2))}
                      </div>
                    </div>
                    {transaction.initiator && (
                      <div className="sm:col-span-2">
                        <div className="text-small text-default-500">{t('meta.initiator')}</div>
                        <AttraccessUser user={transaction.initiator} />
                      </div>
                    )}
                    {transaction.resourceUsage && (
                      <div className="sm:col-span-2">
                        <div className="text-small text-default-500">{t('meta.resourceUsage')}</div>
                        <div className="flex flex-wrap items-center gap-2 font-medium">
                          {transaction.resourceUsage.resource?.name ?? `Usage #${transaction.resourceUsage.id}`}
                          <Button variant="secondary" onPress={() => setUsageOpen(true)}>
                            {t('actions.openUsage')}
                          </Button>
                        </div>
                      </div>
                    )}
                    {transaction.refundOfId && (
                      <div>
                        <div className="text-small text-default-500">{t('meta.refundOf')}</div>
                        <div className="font-medium">#{transaction.refundOfId}</div>
                      </div>
                    )}
                    {transaction.correctionOfId && (
                      <div>
                        <div className="text-small text-default-500">{t('meta.correctionOf')}</div>
                        <div className="font-medium">#{transaction.correctionOfId}</div>
                      </div>
                    )}
                    {transaction.externalReference && (
                      <div>
                        <div className="text-small text-default-500">{t('meta.externalReference')}</div>
                        <div className="font-medium break-all">{transaction.externalReference}</div>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div>
                    <div className="mb-2 font-semibold">{t('items.title')}</div>
                    <Table>
                      <TableScrollContainer>
                        <TableContent aria-label="Transaction items" className="w-full table-fixed">
                          <TableHeader>
                            <TableColumn isRowHeader className="w-[40%] sm:w-[22%]">
                              {t('items.columns.name')}
                            </TableColumn>
                            <TableColumn className="hidden w-[28%] sm:table-cell">
                              {t('items.columns.description')}
                            </TableColumn>
                            <TableColumn className="w-[25%] sm:w-[20%]">{t('items.columns.quantity')}</TableColumn>
                            <TableColumn className="w-[17.5%] px-2 whitespace-normal wrap-anywhere sm:w-[15%]">
                              <span className="sm:hidden">{t('items.columns.rateShort')}</span>
                              <span className="hidden sm:inline">{t('items.columns.unitPrice')}</span>
                            </TableColumn>
                            <TableColumn className="w-[17.5%] px-2 whitespace-normal wrap-anywhere sm:w-[15%]">
                              <span className="sm:hidden">{t('items.columns.totalShort')}</span>
                              <span className="hidden sm:inline">{t('items.columns.subtotal')}</span>
                            </TableColumn>
                          </TableHeader>
                          <TableBody renderEmptyState={() => t('items.empty')}>
                            {(transaction.items ?? []).map((item) => {
                              const isMeter = item.meterCreditsPerUnit != null || item.meterQuantity != null;
                              const value =
                                item.meterQuantity == null
                                  ? t('items.unavailable')
                                  : formatMeterValue(item.meterQuantity);
                              return (
                                <TableRow key={item.id} id={item.id}>
                                  <TableCell className="min-w-0 whitespace-normal wrap-anywhere">
                                    <div className="font-medium">
                                      {!isMeter && tExists('items.system.' + item.name)
                                        ? t('items.system.' + item.name)
                                        : item.name}
                                    </div>
                                    <div className="text-tiny text-default-500 sm:hidden">
                                      {isMeter && item.meterQuantity == null
                                        ? t('items.meterUnavailable', {
                                            rate: formatCredits(item.meterCreditsPerUnit ?? 0),
                                          })
                                        : item.description}
                                    </div>
                                    {item.externalReference && !isMeter && (
                                      <div className="text-tiny text-default-400">{item.externalReference}</div>
                                    )}
                                  </TableCell>
                                  <TableCell className="hidden min-w-0 whitespace-normal wrap-anywhere sm:table-cell">
                                    {isMeter
                                      ? t(
                                          item.meterQuantity == null
                                            ? 'items.meterUnavailable'
                                            : 'items.meterDescription',
                                          {
                                            value,
                                            rate: formatCredits(item.meterCreditsPerUnit ?? 0),
                                          },
                                        )
                                      : item.description}
                                  </TableCell>
                                  <TableCell className="min-w-0 px-2 text-right whitespace-normal wrap-anywhere">
                                    {isMeter ? value : item.quantity}
                                  </TableCell>
                                  <TableCell className="min-w-0 px-2 text-right whitespace-normal wrap-anywhere">
                                    {isMeter
                                      ? formatCredits(item.meterCreditsPerUnit ?? 0)
                                      : formatNumber(
                                          dbCurrencyToUserCurrency(
                                            item.meterCreditsPerUnit ?? item.unitPrice,
                                            configuration?.minorUnit ?? 2,
                                          ),
                                        )}
                                  </TableCell>
                                  <TableCell className="min-w-0 px-2 text-right whitespace-normal wrap-anywhere">
                                    {formatNumber(
                                      dbCurrencyToUserCurrency(
                                        item.unitPrice * item.quantity,
                                        configuration?.minorUnit ?? 2,
                                      ),
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </TableContent>
                      </TableScrollContainer>
                    </Table>
                    <div className="mt-2 flex justify-end text-small text-default-500">
                      <div>
                        {t('items.total')}:{' '}
                        <span className="font-semibold text-foreground">
                          {formatNumber(dbCurrencyToUserCurrency(totalItemsAmount, configuration?.minorUnit ?? 2))}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </ModalBody>
          </>
        )}
      </StandardModal>
      {isOpen && isUsageOpen && transaction?.resourceUsage && (
        <UsageNotesModal
          isOpen
          resourceId={transaction.resourceUsage.resourceId}
          usageId={transaction.resourceUsage.id}
          onClose={() => setUsageOpen(false)}
          onOpenBilling={() => setUsageOpen(false)}
        />
      )}
    </>
  );
}
