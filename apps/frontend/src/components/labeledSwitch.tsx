import { Switch } from '@heroui/react';
import type { ComponentProps, ReactNode } from 'react';

type SwitchProps = ComponentProps<typeof Switch>;

export interface LabeledSwitchProps extends Omit<SwitchProps, 'children'> {
  children?: ReactNode;
  /** Styles the row holding the control and label — the only flex container callers can
      affect, since `className` lands on the outer Switch wrapper. */
  contentClassName?: string;
}

export function LabeledSwitch({ children, contentClassName, ...rest }: LabeledSwitchProps) {
  return (
    <Switch {...rest}>
      {/* HeroUI >= 3.1: only Switch.Content (a SwitchButton) is interactive, so the
          control must live inside it — otherwise clicking the track does nothing. */}
      <Switch.Content className={contentClassName}>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        {children}
      </Switch.Content>
    </Switch>
  );
}
