import { BillingTransaction } from '@attraccess/react-query-client';
import { useSSE } from '../../../../utils/sse';

interface Props {
  onUpdate: (transaction: BillingTransaction) => void;
}

export function useLiveTransactionUpdates(props: Props) {
  const { onUpdate } = props;

  const { abort } = useSSE<BillingTransaction>({
    path: '/api/billing/transactions/live',
    onUpdate,
  });
  return {
    abort,
  };
}
