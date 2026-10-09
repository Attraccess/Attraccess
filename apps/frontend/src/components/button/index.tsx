// Button wrapper overlaying a Spinner while isPending without resizing
// FEATURE: UI primitive ensuring pending mutations show a loading indicator
import { Button as HeroButton, type ButtonProps as HeroButtonProps, Spinner } from '@heroui/react';

export type ButtonProps = HeroButtonProps;

export function Button(props: ButtonProps) {
  const { children, isPending, isIconOnly, ...rest } = props;
  const pendingContentClass = isPending ? (isIconOnly ? 'opacity-0' : 'pr-5') : '';
  return (
    <HeroButton {...rest} isPending={isPending} isIconOnly={isIconOnly}>
      {(renderProps) => (
        <>
          <span
            className={`inline-flex items-center gap-2 ${pendingContentClass}`}
          >
            {typeof children === 'function' ? children(renderProps) : children}
          </span>
          {isPending && (
            <span
              className={`absolute flex items-center ${isIconOnly ? 'inset-0 justify-center' : 'right-3 inset-y-0'}`}
              aria-hidden="true"
            >
              <Spinner color="current" size="sm" />
            </span>
          )}
        </>
      )}
    </HeroButton>
  );
}
