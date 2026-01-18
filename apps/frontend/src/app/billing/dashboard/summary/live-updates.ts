import { BillingTransaction } from '@attraccess/react-query-client';
import { useSSE } from '../../../../utils/sse';

interface Props {
  onUpdate: (transaction: BillingTransaction) => void;
  enabled?: boolean;
}

export function useLiveTransactionUpdates(props: Props) {
  const { onUpdate, enabled = true } = props;

  const { abort } = useSSE<BillingTransaction>({
    path: '/api/billing/transactions/live',
    onUpdate,
    enabled,
  });
  return {
    abort,
  };
}
