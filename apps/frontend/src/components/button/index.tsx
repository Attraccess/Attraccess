// Button wrapper overlaying a Spinner while isPending without resizing
// FEATURE: UI primitive ensuring pending mutations show a loading indicator
import { Button as HeroButton, type ButtonProps as HeroButtonProps, Spinner } from '@heroui/react';

export type ButtonProps = HeroButtonProps;

export function Button(props: ButtonProps) {
  const { children, isPending, ...rest } = props;
  return (
    <HeroButton {...rest} isPending={isPending}>
      {(renderProps) => (
        <>
          <span
            className={`inline-flex items-center gap-2 ${isPending ? 'pr-5' : ''}`}
          >
            {typeof children === 'function' ? children(renderProps) : children}
          </span>
          {isPending && (
            <span className="absolute right-3 inset-y-0 flex items-center" aria-hidden="true">
              <Spinner color="current" size="sm" />
            </span>
          )}
        </>
      )}
    </HeroButton>
  );
}
