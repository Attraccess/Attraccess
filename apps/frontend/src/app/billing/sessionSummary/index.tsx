import { useRef, useState } from 'react';
import { Button, ModalBody, ModalFooter, ModalHeader, ModalHeading, Spinner } from '@heroui/react';
import {
  BillingTransaction,
  BillingTransactionStatus,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetBillingTransaction,
} from '@attraccess/react-query-client';
import { useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { StandardModal } from '../../../components/standardModal';
import { useAuth } from '../../../hooks/useAuth';
import { useLiveTransactionUpdates } from '../dashboard/summary/live-updates';
import en from './en.json';
import de from './de.json';

/** Stays mounted when the active session card disappears or the user navigates away. */
export function SessionBillingSummary() {
  const { user } = useAuth();
  const { t } = useTranslations({ en, de });
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const seen = useRef(new Set<number>());
  const transaction = transactions[0];
  // Keep the receipt visible during the modal's closing animation.
  const lastTransaction = useRef<BillingTransaction | undefined>(undefined);
  if (transaction) lastTransaction.current = transaction;
  const displayedTransaction = transaction ?? lastTransaction.current;
  // Live updates include the receipt fields but do not load the session/resource relations.
  const { data: details } = useBillingServiceGetBillingTransaction(
    { transactionId: displayedTransaction?.id ?? 0 },
    undefined,
    {
      enabled: !!transaction,
    },
  );
  const {
    data: configuration,
    isError,
    refetch,
  } = useBillingServiceGetBillingConfiguration(undefined, {
    enabled: !!transaction,
  });

  const formatNumber = useNumberFormatter({
    minimumFractionDigits: configuration?.minorUnit ?? 2,
    maximumFractionDigits: configuration?.minorUnit ?? 2,
  });

  useLiveTransactionUpdates({
    onUpdate: (incoming) => {
      if (
        incoming.userId !== user?.id ||
        incoming.status !== BillingTransactionStatus.COMPLETED ||
        incoming.amount === 0 ||
        !incoming.resourceUsageId ||
        incoming.refundOfId ||
        incoming.correctionOfId ||
        seen.current.has(incoming.id)
      )
        return;

      seen.current.add(incoming.id);
      setTransactions((previous) => [...previous, incoming]);
    },
  });

  const dismiss = () => setTransactions((previous) => previous.slice(1));

  return (
    <StandardModal
      isOpen={!!transaction}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
      size="sm"
    >
      {() => (
        <>
          <ModalHeader>
            <ModalHeading>{t('title')}</ModalHeading>
          </ModalHeader>
          <ModalBody>
            <p>{details?.resourceUsage?.resource?.name}</p>
            <p className="text-sm text-muted">{t('total')}</p>
            {configuration ? (
              <p className="text-3xl font-semibold" data-cy="session-billing-total">
                {formatNumber(
                  dbCurrencyToUserCurrency(
                    displayedTransaction?.amount ? -displayedTransaction.amount : 0,
                    configuration.minorUnit,
                  ),
                )}{' '}
                {configuration.currency}
              </p>
            ) : isError ? (
              <div>
                <p role="alert">{t('loadError')}</p>
                <Button variant="secondary" onPress={() => void refetch()}>
                  {t('retry')}
                </Button>
              </div>
            ) : (
              <Spinner aria-label={t('loading')} />
            )}
            <p className="text-sm text-muted">{t('historyHint')}</p>
          </ModalBody>
          <ModalFooter>
            <Button onPress={dismiss}>{t('close')}</Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
