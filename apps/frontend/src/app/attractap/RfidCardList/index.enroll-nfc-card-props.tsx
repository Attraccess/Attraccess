export interface EnrollNfcCardProps {
  children: (onOpen: () => void) => React.ReactNode;
  userId?: number;
}
