import { Switch } from '@heroui/react';
import type { ComponentProps, ReactNode } from 'react';

type SwitchProps = ComponentProps<typeof Switch>;

export interface LabeledSwitchProps extends Omit<SwitchProps, 'children'> {
  children?: ReactNode;
}

export function LabeledSwitch({ children, ...rest }: LabeledSwitchProps) {
  return (
    <Switch {...rest}>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      {children != null && children !== false ? <Switch.Content>{children}</Switch.Content> : null}
    </Switch>
  );
}
