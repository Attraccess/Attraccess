export interface Props {
  resourceId: number;
  children: (onOpen: () => void) => React.ReactNode;
}
