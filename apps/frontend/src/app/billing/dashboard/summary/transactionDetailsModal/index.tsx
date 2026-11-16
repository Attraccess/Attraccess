import { UsageNotesModal } from '../../../../resources/usage/components/UsageNotesModal/index';
import { TransactionDetailsModalView, type TransactionDetailsModalProps } from './view';

export {
  TransactionDetailsModalItemsTitle,
  useTransactionDetailsModalState,
  type TransactionDetailsModalProps,
} from './view';

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
