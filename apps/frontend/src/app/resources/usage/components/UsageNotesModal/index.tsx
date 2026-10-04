import { useState } from 'react';
import { useAuth } from '../../../../../hooks/useAuth';
import { TransactionDetailsModal } from '../../../../billing/dashboard/summary/transactionDetailsModal';
import { UsageNotesDrawer, UsageNotesModalProps } from './drawer';

export function UsageNotesModal(props: UsageNotesModalProps) {
  return props.isOpen ? <OpenUsageNotesModal {...props} /> : null;
}

function OpenUsageNotesModal(props: UsageNotesModalProps) {
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const { user } = useAuth();
  const billingTransaction = props.session?.userId === user?.id ? props.session?.billingTransaction : null;

  return (
    <>
      <UsageNotesDrawer
        {...props}
        onOpenBilling={billingTransaction ? () => setTransactionId(billingTransaction.id) : undefined}
      />
      {transactionId !== null && (
        <TransactionDetailsModal transactionId={transactionId} isOpen onClose={() => setTransactionId(null)} />
      )}
    </>
  );
}
