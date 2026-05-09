import { Card, CardContent, CardHeader, ProgressCircle, ProgressCircleFillCircle, ProgressCircleTrack, ProgressCircleTrackCircle } from "@heroui/react";
import { PageHeader } from '../../../../../components/pageHeader';
import { CheckCircle2Icon, XCircleIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import en from './en.json';
import de from './de.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useLiveTransactionUpdates } from '../../summary/live-updates';
import {
  BillingTransaction,
  BillingTransactionStatus,
  useBillingServiceGetBillingTransactions,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../../../hooks/useAuth';

interface Props {
  transactionId?: number;
  onProcessingComplete?: () => void;
}

export function TransactionProcessingCard(props: Props) {
  const { transactionId, onProcessingComplete } = props;
  const { t } = useTranslations({ en, de });

  const [status, setStatus] = useState<BillingTransactionStatus>(BillingTransactionStatus.PENDING);
  const COUNTER_MAX_VALUE = 60;
  const [counter, setCounter] = useState<number>(COUNTER_MAX_VALUE);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const { user: currentUser } = useAuth();
  const { data: transactions } = useBillingServiceGetBillingTransactions(
    {
      userId: currentUser?.id ?? 0,
    },
    undefined,
    {
      refetchInterval: 10000,
    },
  );

  const onUpdate = useCallback(
    (transaction: BillingTransaction) => {
      if (transaction.id !== transactionId) {
        return;
      }

      setLastUpdated(new Date());
      setStatus(transaction.status);

      if (transaction.status !== BillingTransactionStatus.PENDING) {
        setTimeout(() => {
          onProcessingComplete?.();
        }, 1000);
      }
    },
    [transactionId, onProcessingComplete],
  );

  useLiveTransactionUpdates({
    onUpdate,
  });

  useEffect(() => {
    if (counter > 0) {
      setTimeout(() => {
        setCounter(counter - 1);
      }, 1000);
    }
  }, [counter]);

  useEffect(() => {
    const matchingTransaction = transactions?.data.find((transaction) => transaction.id === transactionId);
    if (!matchingTransaction) {
      return;
    }

    const now = new Date();
    if (now.getTime() < lastUpdated.getTime()) {
      return;
    }

    onUpdate(matchingTransaction);
  }, [transactions, transactionId, lastUpdated, onUpdate]);

  return (
    <Card>
      <CardHeader>
        <PageHeader title={t('title')} subtitle={t('description')} noMargin />
      </CardHeader>
      <CardContent className="flex items-center justify-center">
        {status === BillingTransactionStatus.PENDING && (
          <ProgressCircle
            value={COUNTER_MAX_VALUE - counter}
            minValue={0}
            maxValue={COUNTER_MAX_VALUE}
            showValueLabel={true}
          >
            <ProgressCircleTrack>
              <ProgressCircleTrackCircle />
              <ProgressCircleFillCircle />
            </ProgressCircleTrack>
          </ProgressCircle>
        )}
        {status === BillingTransactionStatus.COMPLETED && (
          <CheckCircle2Icon size={128} className="text-success animate-pulse" />
        )}
        {status === BillingTransactionStatus.FAILED && <XCircleIcon size={128} className="text-danger animate-pulse" />}
      </CardContent>
    </Card>
  );
}
