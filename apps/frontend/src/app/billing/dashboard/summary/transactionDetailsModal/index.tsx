import { UsageNotesModal } from '../../../../resources/usage/components/UsageNotesModal/index';
import { TransactionDetailsModalView, type TransactionDetailsModalProps } from './TransactionDetailsModalView';

export { type TransactionDetailsModalProps } from './TransactionDetailsModalView';

export function TransactionDetailsModal(props: TransactionDetailsModalProps) {
  return (
    <TransactionDetailsModalView
      {...props}
      renderUsageDetails={({ resourceId, usageId, onClose }) => (
        <UsageNotesModal isOpen resourceId={resourceId} usageId={usageId} onClose={onClose} onOpenBilling={onClose} />
      )}
    />
  );
}
