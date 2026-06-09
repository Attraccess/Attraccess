import React, { useId } from 'react';
import { Description, InputOTP, Label, REGEXP_ONLY_DIGITS } from '@heroui/react';

export interface OneTimeCodeInputProps {
  label?: React.ReactNode;
  description?: React.ReactNode;
  /** Controlled value of the code. */
  value?: string;
  onChange?: (value: string) => void;
  /** Number of digits. Defaults to 6. */
  length?: number;
  name?: string;
  id?: string;
  isDisabled?: boolean;
  autoFocus?: boolean;
  'data-cy'?: string;
}

/**
 * One-time-code (OTP/2FA) input rendered as individual digit slots.
 * Wraps HeroUI's `InputOTP` and restricts entry to numeric digits.
 */
export const OneTimeCodeInput: React.FC<OneTimeCodeInputProps> = ({
  label,
  description,
  value,
  onChange,
  length = 6,
  name,
  id,
  isDisabled,
  autoFocus,
  'data-cy': dataCy,
}) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const slots = Array.from({ length }, (_, index) => index);

  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <InputOTP
        id={inputId}
        name={name}
        value={value}
        onChange={onChange}
        maxLength={length}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        isDisabled={isDisabled}
        autoFocus={autoFocus}
        data-cy={dataCy}
      >
        <InputOTP.Group>
          {slots.map((index) => (
            <InputOTP.Slot key={index} index={index} />
          ))}
        </InputOTP.Group>
      </InputOTP>
      {description && <Description>{description}</Description>}
    </div>
  );
};
