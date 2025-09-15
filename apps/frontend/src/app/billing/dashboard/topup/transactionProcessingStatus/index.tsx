import { Card, CardBody, CardHeader, CircularProgress } from '@heroui/react';
import { PageHeader } from '../../../../../components/pageHeader';
import { CheckCircle2Icon, XCircleIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import en from './en.json';
import de from './de.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useLiveTransactionUpdates } from '../../summary/live-updates';
import { BillingTransaction } from '@attraccess/react-query-client';

interface Props {
  transactionId?: number;
  onProcessingComplete?: () => void;
}

export function TransactionProcessingCard(props: Props) {
  const { transactionId, onProcessingComplete } = props;
  const { t } = useTranslations({ en, de });

  const [status, setStatus] = useState<BillingTransaction['status']>('pending');
  const COUNTER_MAX_VALUE = 60;
  const [counter, setCounter] = useState<number>(COUNTER_MAX_VALUE);

  const onUpdate = useCallback(
    (transaction: BillingTransaction) => {
      console.log('got update', transaction.id, transactionId, transaction.status);
      if (transaction.id !== transactionId) {
        return;
      }

      setStatus(transaction.status);

      if (transaction.status !== 'pending') {
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

  return (
    <Card>
      <CardHeader>
        <PageHeader title={t('title')} subtitle={t('description')} noMargin />
      </CardHeader>
      <CardBody className="flex items-center justify-center">
        {status === 'pending' && (
          <CircularProgress
            size="lg"
            isIndeterminate={false}
            valueLabel={`${counter}s`}
            value={COUNTER_MAX_VALUE - counter}
            minValue={0}
            maxValue={COUNTER_MAX_VALUE}
            classNames={{
              svg: 'w-36 h-36 drop-shadow-md',
              indicator: 'stroke-primary',
              track: 'stroke-white/10',
              value: 'text-3xl font-semibold text-primary',
            }}
            showValueLabel={true}
            strokeWidth={4}
          />
        )}
        {status === 'completed' && <CheckCircle2Icon size={128} className="text-success animate-pulse" />}
        {status === 'failed' && <XCircleIcon size={128} className="text-danger animate-pulse" />}
      </CardBody>
    </Card>
  );
}
