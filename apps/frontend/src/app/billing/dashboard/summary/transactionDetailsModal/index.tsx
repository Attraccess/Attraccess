import { Button, Chip, Separator, ModalBody, ModalHeader, ModalHeading } from '@heroui/react';
import { AttraccessUser } from '@attraccess/plugins-frontend-ui';
import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { StandardModal } from '../../../../../components/standardModal';
import { RefundModal } from './refund';
import { UsageNotesModal } from '../../../../resources/usage/components/UsageNotesModal';
import { TransactionDetailsModalProps } from './index.transaction-details-modal-props';
import { useTransactionDetailsModalState } from './useTransactionDetailsModalState';
import { TransactionDetailsModalItemsTitle } from './TransactionDetailsModalItemsTitle';

// energyMicroWh is transported as a string because it can exceed Number.MAX_SAFE_INTEGER.
// Do the microWh->kWh division with BigInt so the integer part stays exact; only the final
// display value is coerced to Number.
// ponytail: Number() below still caps precision beyond ~9 quadrillion kWh (2^53) — no real
// energy meter gets there, upgrade to a decimal/bignumber formatter if that ever changes.

export function TransactionDetailsModal(props: TransactionDetailsModalProps) {
  const {
    children,
    transactionId,
    t,
    tExists,
    open,
    isOpen,
    setOpen,
    transaction,
    error,
    refetch,
    configuration,
    isUsageOpen,
    setUsageOpen,
    formatNumber,
    statusColor,
    totalItemsAmount,
  } = useTransactionDetailsModalState(props);

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

                  <TransactionDetailsModalItemsTitle
                    {...{ t, transaction, tExists, formatNumber, configuration, totalItemsAmount }}
                  />
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

export { type TransactionDetailsModalProps } from './index.transaction-details-modal-props';
