// Button wrapper that auto-renders a Spinner while isPending is true
// FEATURE: UI primitive ensuring pending mutations show a loading indicator
import { Button as HeroButton, type ButtonProps as HeroButtonProps, Spinner } from '@heroui/react';

export type ButtonProps = HeroButtonProps;

export function Button(props: ButtonProps) {
  const { children, ...rest } = props;
  return (
    <HeroButton {...rest}>
      {(renderProps) =>
        renderProps.isPending ? (
          <Spinner color="current" />
        ) : typeof children === 'function' ? (
          children(renderProps)
        ) : (
          children
        )
      }
    </HeroButton>
  );
}
