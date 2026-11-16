import { Button, Chip, Separator, ModalBody, ModalHeader, ModalHeading, useOverlayState } from '@heroui/react';
import { AttraccessUser, DateTimeDisplay, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import { RefundModal } from './refund/index';
import { useCreditsFormatter } from '../../../../../hooks/useCreditsFormatter';
import de from './de.json';
import en from './en.json';
import {
  BillingTransaction,
  BillingTransactionStatus,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetBillingTransaction,
} from '@attraccess/react-query-client';
import { useEffect, useState } from 'react';
import { TransactionItemsTable } from './TransactionItemsTable';

export interface TransactionDetailsModalProps {
  children?: (onOpen: () => void) => React.ReactNode;
  transactionId: number;
  isOpen?: boolean;
  onClose?: () => unknown;
}

export interface TransactionUsageDetails {
  resourceId: number;
  usageId: number;
  onClose: () => void;
}

// The usage details modal links back to billing, so it is injected rather than
// imported here; see `./index.tsx`.
export interface TransactionDetailsModalViewProps extends TransactionDetailsModalProps {
  renderUsageDetails: (usage: TransactionUsageDetails) => React.ReactNode;
}

export function TransactionDetailsModalView({
  renderUsageDetails,
  children,
  transactionId,
  isOpen: isOpenProp,
  onClose: onCloseProp,
}: Readonly<TransactionDetailsModalViewProps>) {
  const { t } = useTranslations({ en, de });

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
                        {formatCredits(transaction.amount)}
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

                  <TransactionItemsTable transaction={transaction} />
                </div>
              )}
            </ModalBody>
          </>
        )}
      </StandardModal>
      {isOpen &&
        isUsageOpen &&
        transaction?.resourceUsage &&
        renderUsageDetails({
          resourceId: transaction.resourceUsage.resourceId,
          usageId: transaction.resourceUsage.id,
          onClose: () => setUsageOpen(false),
        })}
    </>
  );
}
