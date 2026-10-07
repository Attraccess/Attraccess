import { NFCCard } from '@attraccess/react-query-client';
export interface DeleteModalProps {
  show: boolean;
  close: () => void;
  cardId: number | null;
}
export interface EnrollNfcCardProps {
  children: (onOpen: () => void) => React.ReactNode;
}

export interface NfcCardTableCellProps {
  header: string;
  card: NFCCard;
  onDeleteClick: () => void;
}
