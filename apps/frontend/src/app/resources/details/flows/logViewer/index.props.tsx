export interface Props {
  children: (open: () => void) => React.ReactNode;
  resourceId: number;
  confettiEnabled: boolean;
  onConfettiEnabledChange: (enabled: boolean) => void;
}
