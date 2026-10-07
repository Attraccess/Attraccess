export interface TransactionDetailsModalProps {
  children?: (onOpen: () => void) => React.ReactNode;
  transactionId: number;
  isOpen?: boolean;
  onClose?: () => unknown;
}
