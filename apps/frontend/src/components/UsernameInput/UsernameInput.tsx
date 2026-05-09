import React, { useMemo } from 'react';
import { TextFieldProps, TextField, Label, Input, FieldError, Description } from '@heroui/react';

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
  onValueChange?: (value: string) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  validationMessages: UsernameValidationMessages;
} & Omit<TextFieldProps, 'value' | 'onChange' | 'children'>;

export function UsernameInput(props: UsernameInputProps) {
  const { value, onValueChange, onChange, label, description, validationMessages, ...rest } = props;
  const { error } = useUsernameValidation(value, validationMessages);

  const handleChange = (v: string) => {
    onChange?.(v);
    onValueChange?.(v);
  };

  return (
    <TextField
      value={value}
      onChange={handleChange}
      isInvalid={!!error}
      {...rest}
    >
      {label && <Label>{label}</Label>}
      <Input
        type="text"
        minLength={USERNAME_RULES.minLength}
        maxLength={USERNAME_RULES.maxLength}
      />
      {error && <FieldError>{error}</FieldError>}
      {description && <Description>{description}</Description>}
    </TextField>
  );
}
