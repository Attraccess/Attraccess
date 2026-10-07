import { BillingTransaction } from '@attraccess/react-query-client';
import { useLiveUpdates } from '../../../../utils/live-updates';

interface Props {
  onUpdate: (transaction: BillingTransaction) => void;
  enabled?: boolean;
}

export function useLiveTransactionUpdates(props: Props) {
  const { onUpdate, enabled = true } = props;

  const { abort } = useLiveUpdates({
    topic: 'billing',
    onUpdate,
    enabled,
  });
  return {
    abort,
  };
}
