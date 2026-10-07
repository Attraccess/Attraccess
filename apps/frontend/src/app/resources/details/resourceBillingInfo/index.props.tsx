import { HTMLAttributes } from 'react';

export interface Props extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  resourceId: number;
  onExampleAmountChange?: (amount: number) => void;
  /** Reports whether the component renders any content. Lets parents reclaim layout space when hidden. */
  onVisibilityChange?: (visible: boolean) => void;
}
