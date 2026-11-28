import { useRef, useState } from 'react';
import { Button, ModalBody, ModalFooter, ModalHeader, ModalHeading, Spinner } from '@heroui/react';
import {
  BillingTransaction,
  BillingTransactionStatus,
  useGetBillingConfiguration,
  useGetBillingTransaction,
} from '@attraccess/react-query-client';
import { StandardModal, useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { useAuth } from '../../../hooks/useAuth';
import { useLiveTransactionUpdates } from '../dashboard/summary/live-updates';
import en from './en.json';
import de from './de.json';

/** At the end of a switched session the cost of all its parts, otherwise the amount of the transaction itself. */
const chargedAmount = (transaction: BillingTransaction) =>
  transaction.switchedSession?.continues === false ? transaction.switchedSession.sessionAmount : transaction.amount;

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
  // Set for a charge of one part of a session whose project was switched.
  const switched = displayedTransaction?.switchedSession;
  const endedAtSwitch = switched?.continues === true;
  // Live updates include the receipt fields but do not load the session/resource relations.
  const { data: details } = useGetBillingTransaction(
    { path: { transactionId: displayedTransaction?.id ?? 0 } },
    undefined,
    {
      // A last part without a charge announces its removed pending bill, which cannot be read.
      enabled: transaction?.status === BillingTransactionStatus.COMPLETED,
    },
  );
  const {
    data: configuration,
    isError,
    refetch,
  } = useGetBillingConfiguration({}, undefined, {
    enabled: !!transaction,
  });

  const formatNumber = useNumberFormatter({
    minimumFractionDigits: configuration?.minorUnit ?? 2,
    maximumFractionDigits: configuration?.minorUnit ?? 2,
  });

  useLiveTransactionUpdates({
    onUpdate: (incoming) => {
      // When a switched session ends, its cost is that of all parts, even if the last one is free.
      const endsSwitchedSession = incoming.switchedSession?.continues === false;
      if (
        incoming.userId !== user?.id ||
        (!endsSwitchedSession && incoming.status !== BillingTransactionStatus.COMPLETED) ||
        chargedAmount(incoming) === 0 ||
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
            <ModalHeading>{t(endedAtSwitch ? 'part.title' : 'title')}</ModalHeading>
          </ModalHeader>
          <ModalBody>
            <p>{switched?.resourceName ?? details?.resourceUsage?.resource?.name}</p>
            <p className="text-sm text-muted">{t(endedAtSwitch ? 'part.total' : 'total')}</p>
            {configuration ? (
              <p className="text-3xl font-semibold" data-cy="session-billing-total">
                {formatNumber(
                  // `0 -` rather than a negation: nothing must not read as "-0.00".
                  dbCurrencyToUserCurrency(
                    0 - (displayedTransaction ? chargedAmount(displayedTransaction) : 0),
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
            {switched && <p className="text-sm">{t(endedAtSwitch ? 'part.continues' : 'allParts')}</p>}
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
