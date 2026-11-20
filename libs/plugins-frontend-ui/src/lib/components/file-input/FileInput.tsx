import { inputVariants } from '@heroui/styles';
import type { ComponentProps } from 'react';

export interface FileInputProps extends Omit<ComponentProps<'input'>, 'type'> {
  /** Shows the field's invalid state (danger border), like HeroUI fields. */
  isInvalid?: boolean;
}

/**
 * Native file picker styled as a HeroUI field, so its boundary uses the shared field border tokens
 * (WCAG 1.4.11) instead of local colours. HeroUI has no file input of its own.
 */
export function FileInput({ isInvalid, className, ...rest }: FileInputProps) {
  return (
    <input
      {...rest}
      type="file"
      aria-invalid={isInvalid || undefined}
      data-invalid={isInvalid || undefined}
      className={inputVariants({
        fullWidth: true,
        className: [
          'cursor-pointer text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-default file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground',
          className,
        ],
      })}
    />
  );
}
