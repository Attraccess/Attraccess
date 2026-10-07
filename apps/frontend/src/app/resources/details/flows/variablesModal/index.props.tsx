export interface Props {
  resourceId: number;
  children: (open: () => void) => React.ReactNode;
}
