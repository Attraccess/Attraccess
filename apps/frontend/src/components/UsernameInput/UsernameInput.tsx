import React, { useMemo } from 'react';
import { Input, InputProps } from '@heroui/react';

export const USERNAME_RULES = {
  minLength: 3,
  maxLength: 32,
  pattern: /^[a-zA-Z0-9_.-]+$/,
};

export type UsernameValidationMessages = {
  length: string;
  format: string;
};

export function useUsernameValidation(username: string, messages: UsernameValidationMessages) {
  const trimmed = useMemo(() => username.trim(), [username]);

  const error = useMemo(() => {
    if (!trimmed.length) {
      return '';
    }

    if (trimmed.length < USERNAME_RULES.minLength || trimmed.length > USERNAME_RULES.maxLength) {
      return messages.length;
    }

    if (!USERNAME_RULES.pattern.test(trimmed)) {
      return messages.format;
    }

    return '';
  }, [messages.format, messages.length, trimmed]);

  const isValid = !!trimmed && !error;

  return { trimmed, error, isValid };
}

type UsernameInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  description: string;
  validationMessages: UsernameValidationMessages;
} & Omit<InputProps, 'value' | 'onValueChange' | 'type'>;

export function UsernameInput(props: UsernameInputProps) {
  const { value, onValueChange, label, description, validationMessages, ...rest } = props;
  const { error } = useUsernameValidation(value, validationMessages);

  return (
    <Input
      type="text"
      label={label}
      value={value}
      onValueChange={onValueChange}
      minLength={USERNAME_RULES.minLength}
      maxLength={USERNAME_RULES.maxLength}
      isInvalid={!!error}
      errorMessage={error || undefined}
      description={description}
      {...rest}
    />
  );
}
