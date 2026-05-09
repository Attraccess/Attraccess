import { Button, Chip, Divider, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalHeader, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, useOverlayState } from '@heroui/react';
import de from './de.json';
import en from './en.json';
import { AttraccessUser, useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../../../components/pageHeader';
import {
  BillingTransaction,
  BillingTransactionStatus,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetBillingTransaction,
} from '@attraccess/react-query-client';
import { DateTimeDisplay, useNumberFormatter } from '@attraccess/plugins-frontend-ui';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { useEffect, useMemo } from 'react';
import { RefundModal } from './refund';

interface Props {
  children?: (onOpen: () => void) => React.ReactNode;
  transactionId: number;
  isOpen?: boolean;
  onClose?: () => unknown;
}

export function TransactionDetailsModal(props: Props) {
  const { children, transactionId, isOpen: isOpenProp, onClose: onCloseProp } = props;

  const { t, tExists } = useTranslations({ en, de });

  const { open, isOpen, setOpen, close } = useOverlayState({ onOpenChange: (o) => { if (!o) onCloseProp?.(); } });

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

  const { data: transaction } = useBillingServiceGetBillingTransaction({ transactionId });
  const { data: configuration } = useBillingServiceGetBillingConfiguration();

  const formatNumber = useNumberFormatter();

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
      <Modal isOpen={isOpen} onOpenChange={setOpen}>
        <ModalBackdrop />
        <ModalContainer size="lg">
          <ModalDialog>
            {() => (<>
          <ModalHeader>
            <PageHeader
              title={t('title')}
              noMargin
              actions={
                <RefundModal transactionId={transactionId}>
                  {(onOpen) => (
                    <Button variant="danger-soft" onPress={onOpen}>
                      {t('actions.refund')}
                    </Button>
                  )}
                </RefundModal>
              }
            />
          </ModalHeader>
          <ModalBody>
            {!transaction ? (
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
                    <Chip color={statusColor(transaction.status)} size="sm" variant="soft">
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
                      <div className="font-medium">
                        {transaction.resourceUsage.resource?.name ?? `Usage #${transaction.resourceUsage.id}`}
                      </div>
                    </div>
                  )}
                  {transaction.refundOfId && (
                    <div>
                      <div className="text-small text-default-500">{t('meta.refundOf')}</div>
                      <div className="font-medium">#{transaction.refundOfId}</div>
                    </div>
                  )}
                  {transaction.externalReference && (
                    <div>
                      <div className="text-small text-default-500">{t('meta.externalReference')}</div>
                      <div className="font-medium break-all">{transaction.externalReference}</div>
                    </div>
                  )}
                </div>

                <Divider />

                <div>
                  <div className="mb-2 font-semibold">{t('items.title')}</div>
                  <Table aria-label="Transaction items">
                    <TableHeader>
                      <TableColumn>{t('items.columns.name')}</TableColumn>
                      <TableColumn>{t('items.columns.description')}</TableColumn>
                      <TableColumn>{t('items.columns.quantity')}</TableColumn>
                      <TableColumn>{t('items.columns.unitPrice')}</TableColumn>
                      <TableColumn>{t('items.columns.subtotal')}</TableColumn>
                    </TableHeader>
                    <TableBody emptyContent={t('items.empty')}>
                      {(transaction.items ?? []).map((item) => (
                        <TableRow key={item.id} id={item.id}>
                          <TableCell>
                            <div className="font-medium">
                              {tExists('items.system.' + item.name) ? t('items.system.' + item.name) : item.name}
                            </div>
                            {item.externalReference && (
                              <div className="text-tiny text-default-400">{item.externalReference}</div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[28ch] truncate" title={item.description ?? undefined}>
                            {item.description}
                          </TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">
                            {formatNumber(dbCurrencyToUserCurrency(item.unitPrice, configuration?.minorUnit ?? 2))}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(
                              dbCurrencyToUserCurrency(item.unitPrice * item.quantity, configuration?.minorUnit ?? 2),
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
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
            </>)}
          </ModalDialog>
        </ModalContainer>
      </Modal>
    </>
  );
}
