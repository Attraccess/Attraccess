import { NFCCard } from '@attraccess/react-query-client';

export interface NfcCardTableCellProps {
  header: string;
  card: NFCCard;
  onDeleteClick: () => void;
}
