// Button wrapper overlaying a Spinner while isPending without resizing
// FEATURE: UI primitive ensuring pending mutations show a loading indicator
import { Button as HeroButton, type ButtonProps as HeroButtonProps, Spinner } from '@heroui/react';

export type ButtonProps = HeroButtonProps;

export function Button(props: ButtonProps) {
  const { children, ...rest } = props;
  return (
    <HeroButton {...rest}>
      {(renderProps) => (
        <>
          <span
            className="inline-flex items-center gap-2"
            style={{ visibility: renderProps.isPending ? 'hidden' : undefined }}
            aria-hidden={renderProps.isPending || undefined}
          >
            {typeof children === 'function' ? children(renderProps) : children}
          </span>
          {renderProps.isPending && (
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner color="current" size="sm" />
            </span>
          )}
        </>
      )}
    </HeroButton>
  );
}
